import {
    CreatePaymentErrorResult,
    CreatePaymentResult,
    CreateRefundResult,
    Injector,
    LanguageCode,
    Order,
    PaymentMetadata,
    PaymentMethodHandler,
    RequestContext,
} from '@vendure/core';
import { GatewayFactory, gatewayAccount } from './gateway-factory';
import { formatMoney } from './gateways/format';
import { describeError } from './gateways/http';
import { GatewayRefund, HostedPaymentGateway } from './gateways/types';
import { gatewayLabel, HostedGatewayCode } from './options';
import { checkGatewayPayment } from './payment-check';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

let gateways: GatewayFactory;

/**
 * Records a hosted payment only after asking the gateway about it. The plugin calls this (through
 * addPaymentToOrder) when a signed callback or a returning customer says a payment went through; the
 * metadata only names the gateway payment, everything else is checked with the gateway.
 */
async function confirmWithGateway(
    code: HostedGatewayCode,
    gateway: HostedPaymentGateway,
    account: string,
    ctx: RequestContext,
    order: Order,
    amount: number,
    metadata: PaymentMetadata,
): Promise<CreatePaymentResult | CreatePaymentErrorResult> {
    const label = gatewayLabel(code);
    // The Shop API's own addPaymentToOrder would skip the plugin's locking, so it can't be used for these methods.
    if (ctx.apiType !== 'admin' && ctx.apiType !== 'custom') {
        return { amount, state: 'Error', errorMessage: `${label} payments are made on the ${label} payment page. Use createHostedPayment.` };
    }
    const reference = typeof metadata.reference === 'string' ? metadata.reference.trim() : '';
    if (!reference) return { amount, state: 'Error', errorMessage: `No ${label} payment was named.` };
    // The plugin asks the gateway just before recording (outside the order lock) and hands the answer over;
    // otherwise ask now. Throws when the gateway can't be asked: nothing is recorded, and it is tried again later.
    const status = gateways.takeRecentlyPaid(code, account, reference) ?? (await gateway.getStatus(reference));
    const check = checkGatewayPayment(status, { gateway: label, orderCode: order.code, amount, currencyCode: order.currencyCode, account });
    const details = {
        gateway: label,
        reference,
        status: status.gatewayStatus,
        method: status.method,
        paidAmount: status.paidAmount,
        paidAt: status.paidAt?.toISOString(),
        test: status.test,
        // Shown to the customer through the Shop API.
        public: { gateway: label, method: status.method },
    };
    if (!check.ok) return { amount, state: 'Declined', transactionId: reference, errorMessage: check.reason, metadata: details };
    return { amount, state: 'Settled', transactionId: reference, metadata: details };
}

function refundResult(label: string, refund: GatewayRefund, transactionId: string): CreateRefundResult {
    if (refund.state === 'settled') return { state: 'Settled', transactionId: refund.id ?? transactionId, metadata: { gateway: label } };
    if (refund.state === 'pending') return { state: 'Pending', transactionId, metadata: { gateway: label, note: refund.message } };
    return { state: 'Failed', transactionId, metadata: { gateway: label, errorMessage: refund.message } };
}

/** CHIP (chip-in.asia): FPX, DuitNow QR, cards and e-wallets on CHIP's hosted page. */
export const chipPaymentHandler = new PaymentMethodHandler({
    code: 'chip',
    description: en('CHIP: online banking (FPX), DuitNow QR, cards and e-wallets'),
    args: {
        brandId: {
            type: 'string',
            label: en('Brand ID'),
            description: en('CHIP portal → Developers → Brands.'),
        },
        secretKey: {
            type: 'string',
            label: en('Secret key'),
            description: en('CHIP portal → Developers → API keys. A test key takes test payments; a live key takes real ones.'),
            ui: { component: 'password-form-input' },
        },
        paymentMethodWhitelist: {
            type: 'string',
            required: false,
            defaultValue: '',
            label: en('Only offer these methods'),
            description: en('Optional. CHIP method names separated by commas, e.g. "fpx, duitnow_qr, visa, mastercard". Leave empty to offer everything your CHIP account has.'),
        },
        apiBaseUrl: {
            type: 'string',
            required: false,
            defaultValue: '',
            label: en('API address (advanced)'),
            description: en('Leave empty. Only for testing against a mock server.'),
        },
    },
    init(injector: Injector) {
        gateways = injector.get(GatewayFactory);
    },
    createPayment: (ctx, order, amount, args, metadata) =>
        confirmWithGateway('chip', gateways.chip(args), gatewayAccount('chip', args), ctx, order, amount, metadata),
    // Payments are created Settled; nothing is ever left Authorized.
    settlePayment: () => ({ success: true }),
    createRefund: async (ctx, input, amount, order, payment, args) => {
        try {
            return refundResult('CHIP', await gateways.chip(args).refund(payment.transactionId, amount), payment.transactionId);
        } catch (error) {
            return { state: 'Failed', transactionId: payment.transactionId, metadata: { gateway: 'CHIP', errorMessage: describeError(error) } };
        }
    },
});

/** Billplz: FPX online banking (and whatever else the collection offers) on Billplz's hosted bill page. */
export const billplzPaymentHandler = new PaymentMethodHandler({
    code: 'billplz',
    description: en('Billplz: online banking (FPX)'),
    args: {
        apiKey: {
            type: 'string',
            label: en('API secret key'),
            description: en('Billplz → Settings → Keys & Integration.'),
            ui: { component: 'password-form-input' },
        },
        collectionId: {
            type: 'string',
            label: en('Collection ID'),
            description: en('Billplz → Billing: the collection this shop’s bills go into.'),
        },
        xSignatureKey: {
            type: 'string',
            label: en('X Signature key'),
            description: en('Billplz → Settings → Keys & Integration. Proves that payment notifications come from Billplz.'),
            ui: { component: 'password-form-input' },
        },
        sandbox: {
            type: 'boolean',
            required: false,
            defaultValue: false,
            label: en('Sandbox account'),
            description: en('Tick when the keys are from billplz-sandbox.com (test payments).'),
        },
        apiBaseUrl: {
            type: 'string',
            required: false,
            defaultValue: '',
            label: en('API address (advanced)'),
            description: en('Leave empty. Only for testing against a mock server.'),
        },
    },
    init(injector: Injector) {
        gateways = injector.get(GatewayFactory);
    },
    createPayment: (ctx, order, amount, args, metadata) =>
        confirmWithGateway('billplz', gateways.billplz(args), gatewayAccount('billplz', args), ctx, order, amount, metadata),
    settlePayment: () => ({ success: true }),
    // Billplz has no refund API: staff send the money back themselves, then settle the refund in the dashboard.
    createRefund: (ctx, input, amount, order, payment) => ({
        state: 'Pending',
        transactionId: payment.transactionId,
        metadata: {
            gateway: 'Billplz',
            note:
                `Billplz can't refund through its API. Send ${formatMoney(amount, order.currencyCode)} back to the customer ` +
                `(Billplz dashboard or bank transfer; bill ${payment.transactionId}), then settle this refund.`,
        },
    }),
});
