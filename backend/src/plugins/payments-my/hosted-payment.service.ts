import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { HistoryEntryType } from '@vendure/common/lib/generated-types';
import {
    ActiveOrderService,
    Channel,
    ConfigService,
    CustomerService,
    ForbiddenError,
    HistoryService,
    ID,
    idsAreEqual,
    isGraphQlErrorResult,
    Logger,
    LogLevel,
    Order,
    OrderService,
    PaymentMethod,
    ProcessContext,
    RelationPaths,
    RequestContext,
    RequestContextService,
    totalCoveredByPayments,
    TransactionalConnection,
} from '@vendure/core';
import { Request } from 'express';
import { Between, In } from 'typeorm';
import { GatewayFactory, MethodGateway } from './gateway-factory';
import { billplzCallbackId } from './gateways/billplz';
import { chipCallbackId, chipCallbackUrlProblem } from './gateways/chip';
import { formatMoney } from './gateways/format';
import { describeError } from './gateways/http';
import { CallbackVerificationError, CheckoutItem, GatewayConfigError, GatewayError, GatewayPaymentStatus, HeaderMap, isPreferredMethod, VerifiedCallback } from './gateways/types';
import { AttemptStatus, HostedPaymentAttempt } from './hosted-payment-attempt.entity';
import { gatewayLabel, HostedGatewayCode, isHostedGateway, loggerCtx, PAYMENTS_MY_OPTIONS, ResolvedPaymentsMyOptions } from './options';
import { callbackUrl, checkReturnUrl, withOrderCode } from './urls';

export interface CreateHostedPaymentInput {
    paymentMethodCode: string;
    returnUrl: string;
    cancelUrl?: string | null;
    preferredMethod?: string | null;
}

export interface HostedPaymentRedirect {
    __typename: 'HostedPaymentRedirect';
    url: string;
    reference: string;
}

/** errorCode is NO_ACTIVE_ORDER_ERROR, ORDER_PAYMENT_STATE_ERROR, INELIGIBLE_PAYMENT_METHOD_ERROR or HOSTED_PAYMENT_ERROR. */
export interface HostedPaymentError {
    __typename: 'HostedPaymentError';
    errorCode: 'NO_ACTIVE_ORDER_ERROR' | 'ORDER_PAYMENT_STATE_ERROR' | 'INELIGIBLE_PAYMENT_METHOD_ERROR' | 'HOSTED_PAYMENT_ERROR';
    message: string;
}

export interface HostedPaymentStatusResult {
    __typename: 'HostedPaymentStatus';
    orderCode: string;
    orderState: string;
    paid: boolean;
}

export interface CallbackResult {
    status: number;
    message: string;
}

/** What recording a paid payment came to. 'held': its payment method is switched off, so it waits. */
type RecordOutcome = 'recorded' | 'already recorded' | 'not recorded' | 'held' | 'missing';
/**
 * What asking the gateway about a payment page came to. 'closed': cancelled, expired or refunded there;
 * 'unknown': this one request failed; 'unreachable': the gateway or the method's settings can't be used now.
 */
type CheckOutcome = RecordOutcome | 'unpaid' | 'closed' | 'unknown' | 'unreachable';

export interface ReconcileParams {
    /** Leave payment pages younger than this to the customer and the callback. */
    olderThanMinutes: number;
    /** Stop asking about payment pages older than this. */
    newerThanHours: number;
    /** Most payment pages to ask about per run. */
    batchSize: number;
}

/** Attempts the gateway may still report paid, or that wait to be recorded. */
const OPEN_STATUSES: AttemptStatus[] = ['pending', 'failed', 'held'];
/** How many of an order's latest open attempts a status check asks about. */
const ATTEMPTS_TO_CHECK = 3;
/** Payment pages one order may ask for per hour, so a looping storefront can't flood the gateway. */
const MAX_STARTS_PER_HOUR = 10;

const fail = (errorCode: HostedPaymentError['errorCode'], message: string): HostedPaymentError => ({ __typename: 'HostedPaymentError', errorCode, message });

/** Settled payments cover the order (refunds don't undo this: the order was paid). */
function isPaid(order: Order): boolean {
    const settled = totalCoveredByPayments(order, 'Settled');
    return order.state !== 'Cancelled' && settled > 0 && settled >= order.totalWithTax;
}

/** What the payment page lists: each line, surcharges and delivery. Gateways only use it when it adds up to the amount. */
function checkoutItems(order: Order): CheckoutItem[] {
    const items: CheckoutItem[] = order.lines.map(line => {
        const name = line.productVariant?.name || 'Item';
        const unitPrice = line.proratedUnitPriceWithTax;
        return unitPrice * line.quantity === line.proratedLinePriceWithTax
            ? { name, unitPrice, quantity: line.quantity }
            : { name: `${line.quantity} × ${name}`, unitPrice: line.proratedLinePriceWithTax, quantity: 1 };
    });
    for (const surcharge of order.surcharges ?? []) items.push({ name: surcharge.description, unitPrice: surcharge.priceWithTax, quantity: 1 });
    if (order.shippingWithTax) items.push({ name: 'Delivery', unitPrice: order.shippingWithTax, quantity: 1 });
    return items;
}

@Injectable()
export class HostedPaymentService implements OnApplicationBootstrap {
    /** When each attempt was last asked about by a status check (Billplz limits these requests). */
    private readonly lastChecked = new Map<string, number>();
    private lastPruned = 0;
    /** When each order asked a gateway for a payment page, successful or not (for the hourly limit). */
    private readonly startsByOrder = new Map<string, number[]>();

    constructor(
        @Inject(PAYMENTS_MY_OPTIONS) private readonly options: ResolvedPaymentsMyOptions,
        private readonly connection: TransactionalConnection,
        private readonly activeOrderService: ActiveOrderService,
        private readonly orderService: OrderService,
        private readonly customerService: CustomerService,
        private readonly configService: ConfigService,
        private readonly requestContextService: RequestContextService,
        private readonly historyService: HistoryService,
        private readonly gateways: GatewayFactory,
        private readonly processContext: ProcessContext,
    ) {}

    onApplicationBootstrap() {
        if (!this.processContext.isServer) return;
        if (!this.options.publicUrlSet) {
            Logger.warn(
                `VENDURE_PUBLIC_URL isn't set, so CHIP and Billplz can't notify this server (using ${this.options.publicUrl}). ` +
                    'Payments are then only recorded when customers come back to the shop. Set it to this server’s public https address.',
                loggerCtx,
            );
        }
        if (!this.options.allowedReturnOrigins.length) {
            Logger.warn('No storefront address is set (STOREFRONT_URL / CORS_ORIGINS), so hosted payments can’t start.', loggerCtx);
        }
    }

    /** Opens a CHIP purchase or Billplz bill for the active order and returns its payment page. */
    async createHostedPayment(ctx: RequestContext, input: CreateHostedPaymentInput): Promise<HostedPaymentRedirect | HostedPaymentError> {
        const active = await this.activeOrderService.getActiveOrder(ctx, undefined);
        const order = active && (await this.orderService.findOne(ctx, active.id, ['customer', 'payments', 'lines', 'lines.productVariant', 'surcharges']));
        if (!order) return fail('NO_ACTIVE_ORDER_ERROR', 'Your bag is empty or your session has ended. Please add your items again.');
        if (order.state !== 'ArrangingPayment') {
            return fail('ORDER_PAYMENT_STATE_ERROR', 'Please finish your delivery details before paying.');
        }

        const method = await this.findHostedMethod(ctx, input.paymentMethodCode);
        const quote = method && (await this.orderService.getEligiblePaymentMethods(ctx, order.id)).find(q => idsAreEqual(q.id, method.id));
        if (!method || !quote) return fail('INELIGIBLE_PAYMENT_METHOD_ERROR', 'This payment option isn’t available.');
        if (!quote.isEligible) return fail('INELIGIBLE_PAYMENT_METHOD_ERROR', quote.eligibilityMessage || 'This payment option isn’t available for this order.');

        const returnCheck = checkReturnUrl(input.returnUrl, this.options.allowedReturnOrigins);
        const cancelCheck = input.cancelUrl ? checkReturnUrl(input.cancelUrl, this.options.allowedReturnOrigins) : returnCheck;
        if (!returnCheck.ok || !cancelCheck.ok) {
            const problem = !returnCheck.ok ? `returnUrl: ${returnCheck.reason}` : !cancelCheck.ok ? `cancelUrl: ${cancelCheck.reason}` : '';
            Logger.warn(`Refused a hosted payment for order ${order.code}: ${problem}`, loggerCtx);
            return fail('HOSTED_PAYMENT_ERROR', 'The payment couldn’t start because the shop’s return address isn’t allowed.');
        }

        const amount = order.totalWithTax - totalCoveredByPayments(order);
        if (amount <= 0) return fail('ORDER_PAYMENT_STATE_ERROR', 'There is nothing left to pay on this order.');
        const email = order.customer?.emailAddress;
        if (!email) return fail('ORDER_PAYMENT_STATE_ERROR', 'Please add your email address before paying.');

        let methodGateway: MethodGateway;
        try {
            methodGateway = this.gateways.forMethod(method);
        } catch (error) {
            Logger.warn(`Payment method ${method.code} isn't set up: ${describeError(error)}`, loggerCtx);
            return fail('INELIGIBLE_PAYMENT_METHOD_ERROR', 'This payment option isn’t available right now.');
        }
        const { code, gateway } = methodGateway;
        let callback: string | undefined = callbackUrl(this.options.publicUrl, code, method.code);
        const callbackProblem = code === 'chip' ? chipCallbackUrlProblem(callback) : undefined;
        if (callbackProblem) {
            Logger.warn(`Not giving CHIP a callback URL (${callbackProblem}); order ${order.code} is confirmed when the customer comes back.`, loggerCtx);
            callback = undefined;
        }
        if (this.tooManyStarts(order.id)) {
            Logger.warn(`Order ${order.code} asked for more than ${MAX_STARTS_PER_HOUR} payment pages within an hour; refusing more for now.`, loggerCtx);
            return fail('HOSTED_PAYMENT_ERROR', 'Too many payment attempts for this order. Please wait a few minutes and try again.');
        }

        let session;
        try {
            session = await gateway.createCheckout({
                reference: order.code,
                amount,
                currencyCode: order.currencyCode,
                customer: {
                    email,
                    // The buyer, not the gift's recipient on the shipping address.
                    fullName: [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' '),
                    phone: order.customer?.phoneNumber || order.billingAddress?.phoneNumber || undefined,
                },
                items: checkoutItems(order),
                description: `Order ${order.code}`,
                returnUrl: withOrderCode(returnCheck.url, order.code),
                cancelUrl: withOrderCode(cancelCheck.url, order.code),
                callbackUrl: callback,
                preferredMethod: isPreferredMethod(input.preferredMethod) ? input.preferredMethod : undefined,
            });
        } catch (error) {
            Logger.error(`Couldn't open a ${gateway.name} payment for order ${order.code}: ${describeError(error)}`, loggerCtx);
            return fail('HOSTED_PAYMENT_ERROR', `We couldn’t open the ${gateway.name} payment page. Please try again in a moment.`);
        }

        await this.connection.getRepository(ctx, HostedPaymentAttempt).save(
            new HostedPaymentAttempt({
                orderId: order.id,
                orderCode: order.code,
                channelId: ctx.channelId,
                paymentMethodCode: method.code,
                gateway: code,
                reference: session.id,
                amount,
                currencyCode: order.currencyCode,
                status: 'pending',
            }),
        );
        Logger.info(`Opened ${gateway.name} payment ${session.id} for order ${order.code} (${formatMoney(amount, order.currencyCode)})`, loggerCtx);
        return { __typename: 'HostedPaymentRedirect', url: session.url, reference: session.id };
    }

    /**
     * Whether an order is paid, for the page customers return to. Asks the gateway (and records the payment)
     * when no callback has done so yet. Access as for orderByCode: the session's order, the customer's own
     * order, or whatever the OrderByCodeAccessStrategy allows.
     */
    async hostedPaymentStatus(ctx: RequestContext, orderCode: string): Promise<HostedPaymentStatusResult> {
        const relations: RelationPaths<Order> = ['customer', 'customer.user', 'payments'];
        let order = await this.orderService.findOneByCode(ctx, orderCode, relations);
        if (!order || !(await this.canAccess(ctx, order))) {
            // The same answer for a missing order as for someone else's, so order codes can't be probed.
            throw new ForbiddenError(LogLevel.Verbose);
        }
        if (!isPaid(order) && order.state !== 'Cancelled' && (await this.checkWithGateway(ctx, order))) {
            order = (await this.orderService.findOneByCode(ctx, orderCode, relations)) ?? order;
        }
        return { __typename: 'HostedPaymentStatus', orderCode: order.code, orderState: order.state, paid: isPaid(order) };
    }

    /**
     * A gateway's server-to-server callback. Its signature is checked against the raw body with the payment
     * method's keys; for a paid payment the gateway is asked again and the payment recorded. Answers 200 when
     * nothing more is needed (including replays), 400 for bad signatures and 503 when the gateway should retry.
     */
    async handleCallback(code: HostedGatewayCode, methodCode: string | undefined, rawBody: Buffer, headers: HeaderMap, req?: Request): Promise<CallbackResult> {
        const label = gatewayLabel(code);
        const reference = code === 'chip' ? chipCallbackId(rawBody) : billplzCallbackId(rawBody);
        if (!reference) return { status: 400, message: 'Unrecognised callback' };
        const attempt = await this.connection.getRepository(HostedPaymentAttempt).findOne({ where: { gateway: code, reference } });
        if (!attempt) {
            Logger.warn(`Ignored a ${label} callback for ${reference}: no payment with that id was started here.`, loggerCtx);
            return { status: 200, message: 'Ignored' };
        }
        if (methodCode && methodCode !== attempt.paymentMethodCode) {
            Logger.warn(`${label} callback for ${reference} names method ${methodCode}, but the payment was started with ${attempt.paymentMethodCode}.`, loggerCtx);
        }

        let ctx: RequestContext;
        let methodGateway: MethodGateway;
        let verified: VerifiedCallback;
        try {
            ctx = await this.attemptContext(attempt, req);
            const method = await this.findHostedMethod(ctx, attempt.paymentMethodCode);
            if (!method) throw new GatewayConfigError(`payment method ${attempt.paymentMethodCode} no longer exists`);
            methodGateway = this.gateways.forMethod(method);
            verified = await methodGateway.gateway.verifyCallback(rawBody, headers);
        } catch (error) {
            if (error instanceof CallbackVerificationError) {
                Logger.warn(`Rejected a ${label} callback for ${reference}${req?.ip ? ` from ${req.ip}` : ''}: ${error.message}.`, loggerCtx);
                return { status: 400, message: 'Invalid signature' };
            }
            Logger.error(`Couldn't check a ${label} callback for ${reference} (order ${attempt.orderCode}): ${describeError(error)}`, loggerCtx);
            return { status: 503, message: 'Try again later' };
        }
        if (verified.id !== attempt.reference || (verified.reference !== undefined && verified.reference !== attempt.orderCode)) {
            Logger.warn(`Rejected a ${label} callback for ${reference}: it doesn't match order ${attempt.orderCode}.`, loggerCtx);
            return { status: 400, message: 'Callback does not match the payment' };
        }
        if (!verified.paid) {
            await this.noteGatewayState(attempt, verified.state);
            return { status: 200, message: 'OK' };
        }
        // A replay of a payment already dealt with: nothing to do.
        if (attempt.status === 'paid' || attempt.status === 'unmatched') return { status: 200, message: 'OK' };

        const outcome = await this.confirmAndRecord(ctx, attempt, methodGateway, `${label} callback`);
        if (outcome === 'unpaid') {
            Logger.warn(`${label} doesn't report payment ${reference} as paid yet although its callback did; waiting for a retry.`, loggerCtx);
            return { status: 503, message: 'Not confirmed yet' };
        }
        // Retried by the gateway (and the scheduled check) until it can be recorded.
        if (outcome === 'unknown' || outcome === 'unreachable' || outcome === 'held') return { status: 503, message: 'Try again later' };
        return { status: 200, message: 'OK' };
    }

    /**
     * For the scheduled task: asks the gateways about payment pages opened a while ago that nothing has
     * confirmed (e.g. a customer paid and closed the browser while callbacks couldn't reach this server), least
     * recently checked first, and records those that were paid.
     */
    async reconcile({ olderThanMinutes, newerThanHours, batchSize }: ReconcileParams): Promise<{ checked: number; recorded: number }> {
        const now = Date.now();
        const attempts = await this.connection.getRepository(HostedPaymentAttempt).find({
            where: {
                status: In(OPEN_STATUSES),
                createdAt: Between(new Date(now - newerThanHours * 3_600_000), new Date(now - olderThanMinutes * 60_000)),
                // Orders already placed or cancelled are left to callbacks (which also catch a second payment).
                order: { active: true },
            },
            order: { checkedAt: { direction: 'ASC', nulls: 'FIRST' }, createdAt: 'ASC' },
            take: batchSize,
        });
        const unusable = new Set<string>();
        let checked = 0;
        let recorded = 0;
        for (const attempt of attempts) {
            // A method that is unreachable or switched off shouldn't hold up the run with a request per payment.
            if (unusable.has(attempt.paymentMethodCode)) continue;
            const outcome = await this.checkAttempt(attempt, 'scheduled check');
            checked++;
            if (outcome === 'unreachable' || outcome === 'held') unusable.add(attempt.paymentMethodCode);
            if (outcome === 'recorded') recorded++;
        }
        if (recorded) Logger.info(`Scheduled check recorded ${recorded} payment(s) that no callback had confirmed.`, loggerCtx);
        return { checked, recorded };
    }

    /**
     * Adds a paid gateway payment to its order, once. The order row is locked first, so simultaneous
     * callbacks and status checks for the same order run one after another and the later ones see the
     * payment already recorded. The gateway was asked just before (outside the lock); createPayment uses that answer.
     */
    async recordPayment(ctx: RequestContext, attemptId: ID, source: string): Promise<RecordOutcome> {
        let placed: Order | undefined;
        const outcome = await this.connection.withTransaction(ctx, async (txCtx): Promise<RecordOutcome> => {
            const attempts = this.connection.getRepository(txCtx, HostedPaymentAttempt);
            const unlocked = await attempts.findOne({ where: { id: attemptId } });
            if (!unlocked) return 'missing';
            await this.lockOrderRow(txCtx, unlocked.orderId);
            const attempt = (await attempts.findOne({ where: { id: attemptId }, ...this.rowLock() })) ?? unlocked;
            if (attempt.status === 'paid') return 'already recorded';
            // Already reported to staff: a replay mustn't add more notes or declined payments.
            if (attempt.status === 'unmatched') return 'not recorded';
            const label = gatewayLabel(attempt.gateway);

            const order = await this.orderService.findOne(txCtx, attempt.orderId, ['payments']);
            if (!order) {
                Logger.error(`${label} payment ${attempt.reference} is for order ${attempt.orderCode}, which can't be found.`, loggerCtx);
                return 'missing';
            }
            if (order.payments.some(p => p.transactionId === attempt.reference && (p.state === 'Settled' || p.state === 'Authorized'))) {
                await attempts.update({ id: attempt.id }, { status: 'paid' });
                return 'already recorded';
            }
            if (order.state === 'Cancelled') {
                await this.unmatched(txCtx, attempt, order, `${this.paidText(attempt)} after this order was cancelled. Refund it from the ${label} dashboard.`);
                return 'not recorded';
            }
            if (order.state !== 'ArrangingPayment' && order.state !== 'AddingItems') {
                const why = totalCoveredByPayments(order) >= order.totalWithTax ? 'this order had already been paid' : `the order was ${order.state}`;
                await this.unmatched(txCtx, attempt, order, `${this.paidText(attempt)}, but ${why}. Refund it from the ${label} dashboard.`);
                return 'not recorded';
            }
            // The customer may have changed the bag after opening the payment page; then this payment can't match.
            const owed = order.totalWithTax - totalCoveredByPayments(order);
            if (owed !== attempt.amount) {
                const now = formatMoney(owed, order.currencyCode);
                await this.unmatched(txCtx, attempt, order, `${this.paidText(attempt)}, but the order changed afterwards and ${now} is owed now. ${this.handAdvice(label)}`);
                return 'not recorded';
            }
            const method = await this.findHostedMethod(txCtx, attempt.paymentMethodCode);
            if (!method?.enabled) {
                // Kept open, so it is recorded once the method is back on; staff are told once.
                if (attempt.status !== 'held') {
                    await attempts.update({ id: attempt.id }, { status: 'held' });
                    const why = method ? 'is switched off' : 'no longer exists';
                    await this.noteForStaff(
                        txCtx,
                        order,
                        `${this.paidText(attempt)}, but payment method ${attempt.paymentMethodCode} ${why}, so it can't be recorded. ` +
                            `Switch the method back on to have it recorded automatically (within 15 minutes, up to 3 days after the payment), or refund it from the ${label} dashboard.`,
                    );
                }
                return 'held';
            }
            let movedToPayment = false;
            if (order.state === 'AddingItems') {
                // The customer went back to the bag (without changing it) after opening the payment page.
                const moved = await this.orderService.transitionToState(txCtx, order.id, 'ArrangingPayment');
                if (isGraphQlErrorResult(moved)) {
                    await this.unmatched(txCtx, attempt, order, `${this.paidText(attempt)}, but the order couldn't go to payment: ${moved.transitionError}. ${this.handAdvice(label)}`);
                    return 'not recorded';
                }
                movedToPayment = true;
            }

            const result = await this.orderService.addPaymentToOrder(txCtx, order.id, {
                method: attempt.paymentMethodCode,
                metadata: { reference: attempt.reference },
            });
            if (!isGraphQlErrorResult(result)) {
                await attempts.update({ id: attempt.id }, { status: 'paid' });
                Logger.info(`Recorded ${label} payment ${attempt.reference} on order ${order.code} (${source}).`, loggerCtx);
                if (result.active === false) placed = result;
                return 'recorded';
            }
            if (movedToPayment) {
                // Give the customer their bag back as it was.
                await this.orderService.transitionToState(txCtx, order.id, 'AddingItems');
            }
            const reason = 'paymentErrorMessage' in result && result.paymentErrorMessage ? result.paymentErrorMessage : result.message;
            await this.unmatched(txCtx, attempt, order, `${this.paidText(attempt)}, but it couldn't be added to this order: ${reason} ${this.handAdvice(label)}`);
            return 'not recorded';
        });
        if (placed) await this.saveNewCustomerAddresses(ctx, placed);
        return outcome;
    }

    /**
     * As Vendure's own addPaymentToOrder does once an order is placed: a new customer's delivery and billing
     * addresses go into their address book. After the payment is committed, so a problem here can't undo it.
     */
    private async saveNewCustomerAddresses(ctx: RequestContext, order: Order) {
        try {
            await this.customerService.createAddressesForNewCustomer(ctx, order);
        } catch (error) {
            Logger.warn(`Couldn't save the addresses of order ${order.code} for its customer: ${describeError(error)}`, loggerCtx);
        }
    }

    private paidText(attempt: HostedPaymentAttempt): string {
        return `${gatewayLabel(attempt.gateway)} payment ${attempt.reference} (${formatMoney(attempt.amount, attempt.currencyCode)}) was paid`;
    }

    private handAdvice(label: string): string {
        return `Check it in the ${label} dashboard, then refund it or add the payment to the order by hand.`;
    }

    /** Paid at the gateway but never to be recorded automatically: say so where staff will see it. */
    private async unmatched(ctx: RequestContext, attempt: HostedPaymentAttempt, order: Order, note: string) {
        await this.connection.getRepository(ctx, HostedPaymentAttempt).update({ id: attempt.id }, { status: 'unmatched' });
        await this.noteForStaff(ctx, order, note);
    }

    private async noteForStaff(ctx: RequestContext, order: Order, note: string) {
        Logger.error(`Order ${order.code}: ${note}`, loggerCtx);
        await this.historyService.createHistoryEntryForOrder({ ctx, orderId: order.id, type: HistoryEntryType.ORDER_NOTE, data: { note } }, false);
    }

    /** Asks the gateway about the order's latest open attempts and records the first one found paid. */
    private async checkWithGateway(ctx: RequestContext, order: Order): Promise<boolean> {
        const attempts = await this.connection.getRepository(ctx, HostedPaymentAttempt).find({
            where: { orderId: order.id, status: In(OPEN_STATUSES) },
            order: { createdAt: 'DESC' },
            take: ATTEMPTS_TO_CHECK,
        });
        for (const attempt of attempts) {
            if (!this.dueForCheck(attempt)) continue;
            const outcome = await this.checkAttempt(attempt, 'customer came back', ctx.req);
            if (outcome === 'recorded' || outcome === 'already recorded') return true;
        }
        return false;
    }

    /** A status check of one payment page, in the channel and with the method it was opened with. */
    private async checkAttempt(attempt: HostedPaymentAttempt, source: string, req?: Request): Promise<CheckOutcome> {
        // Noted first, so a check that fails still counts and the scheduled check moves on to the others.
        await this.connection.getRepository(HostedPaymentAttempt).update({ id: attempt.id }, { checkedAt: new Date() });
        let ctx: RequestContext;
        let methodGateway: MethodGateway;
        try {
            ctx = await this.attemptContext(attempt, req);
            const method = await this.findHostedMethod(ctx, attempt.paymentMethodCode);
            if (!method) throw new GatewayConfigError(`payment method ${attempt.paymentMethodCode} no longer exists`);
            methodGateway = this.gateways.forMethod(method);
        } catch (error) {
            Logger.error(`Can't check ${gatewayLabel(attempt.gateway)} payment ${attempt.reference} for order ${attempt.orderCode}: ${describeError(error)}`, loggerCtx);
            return 'unreachable';
        }
        return this.confirmAndRecord(ctx, attempt, methodGateway, source);
    }

    /** Asks the gateway about a payment page (outside any lock) and records the payment when it was paid. */
    private async confirmAndRecord(ctx: RequestContext, attempt: HostedPaymentAttempt, methodGateway: MethodGateway, source: string): Promise<CheckOutcome> {
        const label = gatewayLabel(attempt.gateway);
        let status: GatewayPaymentStatus;
        try {
            status = await methodGateway.gateway.getStatus(attempt.reference);
        } catch (error) {
            Logger.warn(`Couldn't ask ${label} about payment ${attempt.reference} for order ${attempt.orderCode}: ${describeError(error)}`, loggerCtx);
            // Wrong keys affect every payment of the method; other refusals only this one.
            const onlyThisOne = error instanceof GatewayError && !error.retryable && error.status !== 401 && error.status !== 403;
            return onlyThisOne ? 'unknown' : 'unreachable';
        }
        if (status.state !== 'paid') {
            await this.noteGatewayState(attempt, status.state);
            return status.state === 'pending' || status.state === 'failed' ? 'unpaid' : 'closed';
        }
        this.gateways.rememberPaid(methodGateway.code, methodGateway.account, status);
        try {
            return await this.recordPayment(ctx, attempt.id, source);
        } catch (error) {
            Logger.error(`Couldn't record ${label} payment ${attempt.reference} on order ${attempt.orderCode}: ${describeError(error)}`, loggerCtx);
            return 'unknown';
        }
    }

    /** Keeps an open attempt's status in step with the gateway, never touching one already dealt with. */
    private async noteGatewayState(attempt: HostedPaymentAttempt, state: GatewayPaymentStatus['state']) {
        // A paid payment is recorded, not noted; a held one stays held unless the gateway closes it (e.g. refunded).
        if (state === 'paid' || state === attempt.status) return;
        if (attempt.status === 'held' && (state === 'pending' || state === 'failed')) return;
        await this.connection
            .getRepository(HostedPaymentAttempt)
            .update({ id: attempt.id, status: In(OPEN_STATUSES) }, { status: state });
    }

    private dueForCheck(attempt: HostedPaymentAttempt): boolean {
        const now = Date.now();
        if (now - this.lastPruned > 60_000) {
            const keep = Math.max(10 * 60_000, this.options.statusCheckIntervalMs);
            for (const [key, at] of this.lastChecked) if (now - at > keep) this.lastChecked.delete(key);
            this.lastPruned = now;
        }
        const key = String(attempt.id);
        const last = this.lastChecked.get(key);
        if (last !== undefined && now - last < this.options.statusCheckIntervalMs) return false;
        this.lastChecked.set(key, now);
        return true;
    }

    /** Counts a request for a payment page; true when the order has made too many in the last hour. */
    private tooManyStarts(orderId: ID): boolean {
        const now = Date.now();
        const hourAgo = now - 60 * 60_000;
        if (this.startsByOrder.size > 1000) {
            for (const [key, times] of this.startsByOrder) if (times.every(at => at <= hourAgo)) this.startsByOrder.delete(key);
        }
        const key = String(orderId);
        const recent = (this.startsByOrder.get(key) ?? []).filter(at => at > hourAgo);
        const tooMany = recent.length >= MAX_STARTS_PER_HOUR;
        if (!tooMany) recent.push(now);
        this.startsByOrder.set(key, recent);
        return tooMany;
    }

    private async canAccess(ctx: RequestContext, order: Order): Promise<boolean> {
        if (ctx.session?.activeOrderId && idsAreEqual(ctx.session.activeOrderId, order.id)) return true;
        const userId = order.customer?.user?.id;
        if (ctx.activeUserId && userId && idsAreEqual(userId, ctx.activeUserId)) return true;
        return this.configService.orderOptions.orderByCodeAccessStrategy.canAccessOrder(ctx, order);
    }

    /** A CHIP or Billplz payment method in the context's channel (enabled or not). */
    private async findHostedMethod(ctx: RequestContext, code: string): Promise<PaymentMethod | undefined> {
        if (!code) return undefined;
        const method = await this.connection
            .getRepository(ctx, PaymentMethod)
            .createQueryBuilder('method')
            .leftJoin('method.channels', 'channel')
            .where('method.code = :code', { code })
            .andWhere('channel.id = :channelId', { channelId: ctx.channelId })
            .getOne();
        return method && isHostedGateway(method.handler.code) ? method : undefined;
    }

    /** An internal context in the channel the payment was started in (createPayment only settles for internal callers). */
    private async attemptContext(attempt: HostedPaymentAttempt, req?: Request): Promise<RequestContext> {
        const channel = await this.connection.getRepository(Channel).findOne({ where: { id: attempt.channelId }, select: { id: true, token: true } });
        // Never another channel's payment methods and keys instead.
        if (!channel) throw new GatewayConfigError(`channel ${attempt.channelId} of order ${attempt.orderCode} no longer exists`);
        // By token, so the channel comes from Vendure's channel cache with its tax and shipping zones, as for any request.
        return this.requestContextService.create({ apiType: 'admin', channelOrToken: channel.token, req });
    }

    private async lockOrderRow(ctx: RequestContext, orderId: ID) {
        const lock = this.rowLock();
        if (!lock.lock) return;
        await this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .select('order.id')
            .where('order.id = :orderId', { orderId })
            .setLock(lock.lock.mode)
            .getOne();
    }

    /** SELECT … FOR UPDATE where the database has row locks (SQLite serialises writes anyway). */
    private rowLock(): { lock?: { mode: 'pessimistic_write' } } {
        const type = this.connection.rawConnection.options.type;
        return type === 'sqlite' || type === 'better-sqlite3' || type === 'sqljs' ? {} : { lock: { mode: 'pessimistic_write' } };
    }
}
