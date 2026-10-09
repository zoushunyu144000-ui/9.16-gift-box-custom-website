import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    ActiveOrderService,
    AdministratorService,
    assertFound,
    Customer,
    CustomerService,
    EntityNotFoundError,
    EventBus,
    ID,
    idsAreEqual,
    Logger,
    Order,
    OrderPlacedEvent,
    OrderService,
    OrderStateTransitionEvent,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { LOYALTY_OPTIONS, loggerCtx } from './constants';
import { LoyaltyPointsEntry } from './loyalty-points-entry.entity';
import {
    cancellationEntries,
    formatPoints,
    LoyaltyOptions,
    LoyaltyReason,
    orderEntryKey,
    pointsEarned,
    pointsRequestedOn,
    productsSubtotalSen,
    redemptionProblem,
} from './points';
import { LOYALTY_ACTION_CODE } from './promotion';
import { LoyaltyTierService } from './tier.service';

/**
 * The Shop API's refusal (api-contracts §4). Deliberately not Vendure's ErrorResult class: Vendure looks
 * those messages up as translation keys, and these are already written for the customer.
 */
export class LoyaltyPointsError {
    readonly __typename = 'LoyaltyPointsError';
    readonly errorCode = 'LOYALTY_POINTS_ERROR';

    constructor(readonly message: string) {}
}

export interface LoyaltyHistoryOptions {
    skip?: number | null;
    take?: number | null;
}

export interface LoyaltyHistoryItem {
    id: ID;
    createdAt: Date;
    points: number;
    reason: LoyaltyReason;
    note: string | null;
    orderId: ID | null;
    orderCode: string | null;
    administratorName: string | null;
}

interface NewEntry {
    customerId: ID;
    orderId?: ID | null;
    points: number;
    reason: LoyaltyReason;
    note?: string | null;
    uniqueKey?: string | null;
    administratorId?: ID | null;
}

/** Thrown inside the apply transaction to undo the trial recalculation; returned as a LoyaltyPointsError. */
class RedemptionRefused extends Error {}

const balanceOf = (customer: Customer) => (customer.customFields as { loyaltyPoints?: number | null }).loyaltyPoints ?? 0;

@Injectable()
export class LoyaltyService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private eventBus: EventBus,
        private customerService: CustomerService,
        private orderService: OrderService,
        private activeOrderService: ActiveOrderService,
        private administratorService: AdministratorService,
        private tierService: LoyaltyTierService,
        @Inject(LOYALTY_OPTIONS) private options: LoyaltyOptions,
    ) {}

    onApplicationBootstrap() {
        // Blocking handlers run inside the order's own transaction, so points are recorded or rolled back
        // together with the order change that caused them. A points failure is logged, never stops the order.
        this.eventBus.registerBlockingEventHandler({
            event: OrderStateTransitionEvent,
            id: 'loyalty-order-state',
            handler: event => this.onOrderStateChange(event),
        });
        this.eventBus.registerBlockingEventHandler({
            event: OrderPlacedEvent,
            id: 'loyalty-order-placed',
            handler: event => this.onOrderPlaced(event),
        });
    }

    getSettings() {
        const { pointsPerRinggit, pointValueSen, minRedeemPoints, maxRedeemPercent } = this.options;
        return { pointsPerRinggit, pointValueSen, minRedeemPoints, maxRedeemPercent };
    }

    async activeCustomer(ctx: RequestContext): Promise<Customer | undefined> {
        return ctx.activeUserId ? this.customerService.findOneByUserId(ctx, ctx.activeUserId) : undefined;
    }

    /** Newest first. */
    async history(ctx: RequestContext, customerId: ID, options: LoyaltyHistoryOptions = {}) {
        const take = Math.min(Math.max(options.take ?? 20, 1), 100);
        const skip = Math.max(options.skip ?? 0, 0);
        const query = this.connection
            .getRepository(ctx, LoyaltyPointsEntry)
            .createQueryBuilder('entry')
            .leftJoin('entry.order', 'order')
            .addSelect(['order.id', 'order.code'])
            .leftJoin('entry.administrator', 'administrator')
            .addSelect(['administrator.id', 'administrator.firstName', 'administrator.lastName'])
            .where('entry.customerId = :customerId', { customerId });
        const [entries, totalItems] = await query
            .orderBy('entry.createdAt', 'DESC')
            .addOrderBy('entry.id', 'DESC')
            // The joins are many-to-one, so plain offset/limit can't split rows.
            .offset(skip)
            .limit(take)
            .getManyAndCount();
        return { items: entries.map(toHistoryItem), totalItems };
    }

    /** Staff adjustment (Admin API). Refuses to take a balance below 0. */
    async adjust(ctx: RequestContext, customerId: ID, points: number, note: string): Promise<Customer> {
        if (!Number.isInteger(points) || points === 0) {
            throw new UserInputError('Enter a whole number of points to add, or a negative number to take away.');
        }
        const reason = note?.trim();
        if (!reason) throw new UserInputError('Please add a note saying why the points change.');
        const customer = await this.customerService.findOne(ctx, customerId);
        if (!customer) throw new EntityNotFoundError('Customer', customerId);
        const administrator = ctx.activeUserId ? await this.administratorService.findOneByUserId(ctx, ctx.activeUserId) : undefined;
        await this.record(
            ctx,
            { customerId: customer.id, points, reason: 'adjusted', note: reason, administratorId: administrator?.id ?? null },
            { mayGoBelowZero: false },
        );
        return assertFound(this.customerService.findOne(ctx, customer.id));
    }

    /**
     * Shop API applyLoyaltyPoints: stores the points on the active order and recalculates it, which applies
     * (or removes) the promotion discount. 0 removes the points.
     */
    async applyToActiveOrder(ctx: RequestContext, points: number): Promise<Order | LoyaltyPointsError> {
        if (!Number.isInteger(points) || points < 0) return new LoyaltyPointsError('Please enter a whole number of points.');
        const customer = await this.activeCustomer(ctx);
        if (!customer) return new LoyaltyPointsError('Please sign in to use your points.');
        const activeOrder = await this.activeOrderService.getActiveOrder(ctx, undefined);
        const order = activeOrder && (await this.orderService.findOne(ctx, activeOrder.id));
        if (!order) return new LoyaltyPointsError('Please add something to your bag first.');
        if (!order.customerId || !idsAreEqual(order.customerId, customer.id)) {
            return new LoyaltyPointsError('Please sign in again to use your points.');
        }
        // After this the total may already have been sent to a payment page.
        if (order.state !== 'AddingItems') {
            return new LoyaltyPointsError('Points can only be changed before payment. Please go back to your bag to change them.');
        }
        if (points === 0) {
            if (pointsRequestedOn(order) === 0) return order;
            await this.setPointsRequested(ctx, order, 0);
            return this.orderService.applyPriceAdjustments(ctx, order);
        }
        if (order.lines.length === 0) return new LoyaltyPointsError('Please add something to your bag first.');
        try {
            // Price the order without points to measure the subtotal they may pay for, then with them. A refusal
            // throws, which rolls back to a savepoint, so the order keeps the points it had before.
            return await this.connection.withTransaction(ctx, async tx => {
                await this.setPointsRequested(tx, order, 0);
                const withoutPoints = await this.orderService.applyPriceAdjustments(tx, order);
                const problem = redemptionProblem(
                    { points, balance: balanceOf(customer), productsSubtotalSen: productsSubtotalSen(withoutPoints, tx.channel.pricesIncludeTax) },
                    this.options,
                );
                if (problem) throw new RedemptionRefused(problem);
                await this.setPointsRequested(tx, withoutPoints, points);
                const withPoints = await this.orderService.applyPriceAdjustments(tx, withoutPoints);
                if (!(await this.discountApplied(tx, order.id))) {
                    Logger.warn('Points were refused: no enabled promotion applies the loyalty discount. Run setupLoyalty() or add it under Promotions.', loggerCtx);
                    throw new RedemptionRefused('Points can’t be used at the moment. Please try again later.');
                }
                return withPoints;
            });
        } catch (e) {
            if (e instanceof RedemptionRefused) return new LoyaltyPointsError(e.message);
            throw e;
        }
    }

    /**
     * Before payment (→ ArrangingPayment): the balance may have changed or the bag may no longer fit the points
     * since they were applied. Returns the message that stops checkout, or undefined.
     */
    async checkBeforePayment(ctx: RequestContext, order: Order): Promise<string | undefined> {
        const points = pointsRequestedOn(order);
        if (!points) return;
        const customer = order.customerId
            ? await this.connection.getRepository(ctx, Customer).findOne({ where: { id: order.customerId } })
            : undefined;
        const balance = customer ? balanceOf(customer) : 0;
        if (balance < points) {
            return `You have ${formatPoints(Math.max(balance, 0))} points now, fewer than the ${formatPoints(points)} on this order. Please change the points used.`;
        }
        if (await this.discountApplied(ctx, order.id)) return;
        const subtotal = productsSubtotalSen(order, ctx.channel.pricesIncludeTax);
        return (
            redemptionProblem({ points, balance, productsSubtotalSen: subtotal }, this.options) ??
            'Points can’t be used at the moment. Please remove them from your order to continue.'
        );
    }

    /** Whether the order's prices include the points discount (the promotion is on the order). */
    async discountApplied(ctx: RequestContext, orderId: ID): Promise<boolean> {
        const order = await this.connection.getRepository(ctx, Order).findOne({ where: { id: orderId }, relations: { promotions: true } });
        return !!order?.promotions?.some(p => p.actions.some(a => a.code === LOYALTY_ACTION_CODE));
    }

    private async onOrderStateChange({ ctx, order, toState }: OrderStateTransitionEvent) {
        if (toState === this.options.earnOnState) await this.safely(ctx, order, 'add the points earned on', tx => this.earn(tx, order));
        if (toState === 'Cancelled') await this.safely(ctx, order, 'reverse the points of', tx => this.reverse(tx, order));
        // Settling or cancelling an order changes its customer's lifetime spend, so their tier may change now
        // rather than at the nightly run.
        const customerId = order.customerId;
        if ((toState === 'PaymentSettled' || toState === 'Cancelled') && customerId && this.tierService.enabled) {
            await this.safely(ctx, order, 'update the member tier for', tx => this.tierService.updateTiers(tx, [customerId]), 'The nightly tier update will catch up.');
        }
    }

    private async onOrderPlaced({ ctx, order }: OrderPlacedEvent) {
        await this.safely(ctx, order, 'take the points used on', tx => this.redeem(tx, order));
    }

    /** Runs points work in a savepoint, so a failure leaves the order's own transaction able to carry on. */
    private async safely(
        ctx: RequestContext,
        order: Order,
        action: string,
        work: (tx: RequestContext) => Promise<unknown>,
        fix = 'Correct the balance with adjustLoyaltyPoints.',
    ) {
        try {
            await this.connection.withTransaction(ctx, work);
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            Logger.error(`Could not ${action} order ${order.code}: ${error.message}. ${fix}`, loggerCtx, error.stack);
        }
    }

    private async earn(ctx: RequestContext, order: Order) {
        // Guests don't collect points: only customers with an account.
        if (!order.customerId || !(await this.isRegistered(ctx, order.customerId))) return;
        const points = pointsEarned(order.subTotalWithTax, this.options.pointsPerRinggit);
        if (points <= 0) return;
        await this.record(
            ctx,
            { customerId: order.customerId, orderId: order.id, points, reason: 'earned', uniqueKey: orderEntryKey(order.id, 'earned') },
            { mayGoBelowZero: true },
        );
    }

    private async redeem(ctx: RequestContext, order: Order) {
        const points = pointsRequestedOn(order);
        if (!points || !order.customerId) return;
        // Only points that came off the price are taken; when the discount is on, it is exactly their value.
        if (!(await this.discountApplied(ctx, order.id))) return;
        await this.record(
            ctx,
            { customerId: order.customerId, orderId: order.id, points: -points, reason: 'redeemed', uniqueKey: orderEntryKey(order.id, 'redeemed') },
            // The payment is already taken, so a balance spent elsewhere meanwhile is recorded as it is.
            { mayGoBelowZero: true },
        );
    }

    private async reverse(ctx: RequestContext, order: Order) {
        const existing = await this.connection.getRepository(ctx, LoyaltyPointsEntry).find({ where: { orderId: order.id } });
        for (const planned of cancellationEntries(order.id, existing)) {
            await this.record(ctx, { ...planned, orderId: order.id }, { mayGoBelowZero: true });
        }
    }

    private async isRegistered(ctx: RequestContext, customerId: ID) {
        const customer = await this.connection.getRepository(ctx, Customer).findOne({ where: { id: customerId }, relations: { user: true } });
        return !!customer?.user && !customer.deletedAt;
    }

    /**
     * Adds a ledger entry and moves the balance by the same amount, in one transaction. Entries with a
     * uniqueKey are added once; a repeat returns undefined.
     */
    private async record(ctx: RequestContext, input: NewEntry, { mayGoBelowZero }: { mayGoBelowZero: boolean }) {
        return this.connection.withTransaction(ctx, async tx => {
            const customers = this.connection.getRepository(tx, Customer);
            // Locking the customer's row makes one ledger write per customer at a time, so the "already
            // recorded?" and "enough points?" checks can't race a concurrent write.
            const customer = await customers
                .createQueryBuilder('customer')
                .setLock('pessimistic_write')
                .where('customer.id = :id', { id: input.customerId })
                .getOne();
            if (!customer) throw new EntityNotFoundError('Customer', input.customerId);
            const entries = this.connection.getRepository(tx, LoyaltyPointsEntry);
            if (input.uniqueKey && (await entries.findOne({ where: { uniqueKey: input.uniqueKey } }))) return undefined;
            const balance = balanceOf(customer) + input.points;
            if (balance < 0 && !mayGoBelowZero) {
                throw new UserInputError(`That would take the balance below 0: the customer has ${formatPoints(balanceOf(customer))} points.`);
            }
            const entry = await entries.save(
                new LoyaltyPointsEntry({
                    customerId: input.customerId,
                    orderId: input.orderId ?? null,
                    points: input.points,
                    reason: input.reason,
                    note: input.note ?? null,
                    uniqueKey: input.uniqueKey ?? null,
                    administratorId: input.administratorId ?? null,
                }),
            );
            await customers.increment({ id: input.customerId }, 'customFields.loyaltyPoints', input.points);
            if (balance < 0) {
                Logger.warn(`Customer ${input.customerId} now has ${balance} points after "${input.reason}" (${input.uniqueKey ?? 'staff'}).`, loggerCtx);
            }
            return entry;
        });
    }

    private async setPointsRequested(ctx: RequestContext, order: Order, points: number) {
        // The promotion condition reads the order in memory, and recalculating prices doesn't save custom
        // fields, so set both.
        (order.customFields as { loyaltyPointsApplied?: number }).loyaltyPointsApplied = points;
        await this.connection
            .getRepository(ctx, Order)
            .update({ id: order.id }, { customFields: { loyaltyPointsApplied: points } as Order['customFields'] });
    }
}

function toHistoryItem(entry: LoyaltyPointsEntry): LoyaltyHistoryItem {
    const staff = entry.administrator;
    return {
        id: entry.id,
        createdAt: entry.createdAt,
        points: entry.points,
        reason: entry.reason,
        note: entry.note,
        orderId: entry.order?.id ?? null,
        orderCode: entry.order?.code ?? null,
        administratorName: staff ? `${staff.firstName} ${staff.lastName}`.trim() : null,
    };
}
