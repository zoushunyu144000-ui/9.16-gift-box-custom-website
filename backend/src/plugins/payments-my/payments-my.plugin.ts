import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { shopApiExtensions } from './api-extensions';
import { HostedPaymentCallbackController } from './callback.controller';
import { GatewayFactory } from './gateway-factory';
import { billplzPaymentHandler, chipPaymentHandler } from './handlers';
import { HostedPaymentAttempt } from './hosted-payment-attempt.entity';
import { CreateHostedPaymentResultResolver, HostedPaymentShopResolver } from './hosted-payment.resolver';
import { HostedPaymentService } from './hosted-payment.service';
import { PAYMENTS_MY_OPTIONS, PaymentsMyOptions, resolveOptions } from './options';
import { rawBodyMiddleware } from './raw-body.middleware';
import { reconcileHostedPaymentsTask } from './reconcile-task';
import { pendingRefundProcess } from './refund-process';

/**
 * Malaysian hosted payments: CHIP (FPX, DuitNow QR, cards, e-wallets) and Billplz (FPX).
 *
 * - Staff add a payment method in the dashboard with the `chip` or `billplz` handler and the shop's own keys.
 * - The storefront calls `createHostedPayment` and sends the customer to the returned page; afterwards it asks
 *   `hostedPaymentStatus` (contract: docs/api-contracts.md §1).
 * - Gateways notify POST /payments/chip/callback and /payments/billplz/callback. Signatures are checked on the
 *   raw body and every payment is confirmed with the gateway before it is recorded, once, for the exact amount.
 * - A scheduled task (worker, every 15 minutes) records payments that neither a callback nor the customer's
 *   return confirmed.
 * - Refunds: CHIP through its API; Billplz by hand (the refund waits as Pending with a note).
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    entities: [HostedPaymentAttempt],
    providers: [{ provide: PAYMENTS_MY_OPTIONS, useFactory: () => resolveOptions(MalaysianPaymentsPlugin.options) }, GatewayFactory, HostedPaymentService],
    controllers: [HostedPaymentCallbackController],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [HostedPaymentShopResolver, CreateHostedPaymentResultResolver],
    },
    configuration: config => {
        config.paymentOptions.paymentMethodHandlers.push(chipPaymentHandler, billplzPaymentHandler);
        // Billplz refunds (and slow CHIP ones) stay Pending until staff settle them.
        config.paymentOptions.refundProcess = [...(config.paymentOptions.refundProcess ?? []), pendingRefundProcess];
        config.schedulerOptions.tasks = [...(config.schedulerOptions.tasks ?? []), reconcileHostedPaymentsTask];
        // Only these two routes get the raw body; other routes keep Vendure's JSON parsing.
        config.apiOptions.middleware.push(
            { route: '/payments/chip/callback', handler: rawBodyMiddleware(), beforeListen: true },
            { route: '/payments/billplz/callback', handler: rawBodyMiddleware(), beforeListen: true },
        );
        return config;
    },
})
export class MalaysianPaymentsPlugin {
    static options: PaymentsMyOptions = {};

    static init(options: PaymentsMyOptions = {}) {
        this.options = { ...this.options, ...options };
        return MalaysianPaymentsPlugin;
    }
}
