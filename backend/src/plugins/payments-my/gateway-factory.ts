import { Inject, Injectable } from '@nestjs/common';
import { Logger, PaymentMethod } from '@vendure/core';
import { BillplzClient } from './gateways/billplz';
import { CHIP_PAYMENT_METHODS, ChipClient, parseChipMethods } from './gateways/chip';
import { GatewayConfigError, GatewayPaymentStatus, HostedPaymentGateway } from './gateways/types';
import { HostedGatewayCode, loggerCtx, PAYMENTS_MY_OPTIONS, ResolvedPaymentsMyOptions } from './options';

/** CHIP handler settings (all strings, as payment method arguments are stored). */
export interface ChipArgs {
    brandId?: string;
    secretKey?: string;
    paymentMethodWhitelist?: string;
    apiBaseUrl?: string;
}

export interface BillplzArgs {
    apiKey?: string;
    collectionId?: string;
    xSignatureKey?: string;
    sandbox?: boolean;
    apiBaseUrl?: string;
}

export interface MethodGateway {
    code: HostedGatewayCode;
    gateway: HostedPaymentGateway;
    /** The shop's merchant account at the gateway: payments must belong to it. */
    account: string;
}

/** The shop's merchant account at the gateway (CHIP brand, Billplz collection), from the method's settings. */
export function gatewayAccount(code: HostedGatewayCode, args: { brandId?: string; collectionId?: string }): string {
    return ((code === 'chip' ? args.brandId : args.collectionId) ?? '').trim();
}

// A paid status fetched moments ago is handed to createPayment instead of asking the gateway again.
const RECENTLY_PAID_MS = 60_000;

/** Builds gateway clients from payment method settings, with the plugin's timeout (and test fetch). */
@Injectable()
export class GatewayFactory {
    private readonly recentlyPaid = new Map<string, { status: GatewayPaymentStatus; at: number }>();
    private readonly warnedWhitelists = new Set<string>();

    constructor(@Inject(PAYMENTS_MY_OPTIONS) private readonly options: ResolvedPaymentsMyOptions) {}

    chip(args: ChipArgs): ChipClient {
        const whitelist = parseChipMethods(args.paymentMethodWhitelist);
        const unknown = whitelist.filter(name => !(CHIP_PAYMENT_METHODS as readonly string[]).includes(name));
        if (unknown.length && !this.warnedWhitelists.has(unknown.join())) {
            // Still sent: CHIP may have added methods since this list was written.
            this.warnedWhitelists.add(unknown.join());
            Logger.warn(`CHIP "Only offer these methods" has names CHIP didn't document: ${unknown.join(', ')}. Check for typos.`, loggerCtx);
        }
        return new ChipClient({
            brandId: args.brandId ?? '',
            secretKey: args.secretKey ?? '',
            paymentMethodWhitelist: whitelist,
            baseUrl: args.apiBaseUrl || undefined,
            fetch: this.options.fetch,
            timeoutMs: this.options.gatewayTimeoutMs,
        });
    }

    billplz(args: BillplzArgs): BillplzClient {
        return new BillplzClient({
            apiKey: args.apiKey ?? '',
            collectionId: args.collectionId ?? '',
            xSignatureKey: args.xSignatureKey ?? '',
            sandbox: args.sandbox === true,
            baseUrl: args.apiBaseUrl || undefined,
            fetch: this.options.fetch,
            timeoutMs: this.options.gatewayTimeoutMs,
        });
    }

    /** The client for a saved payment method; throws GatewayConfigError when it isn't set up. */
    forMethod(method: PaymentMethod): MethodGateway {
        const args: Record<string, string | undefined> = Object.fromEntries(method.handler.args.map(arg => [arg.name, arg.value]));
        if (method.handler.code === 'chip') {
            return { code: 'chip', gateway: this.chip(args), account: gatewayAccount('chip', args) };
        }
        if (method.handler.code === 'billplz') {
            return { code: 'billplz', gateway: this.billplz({ ...args, sandbox: args.sandbox === 'true' }), account: gatewayAccount('billplz', args) };
        }
        throw new GatewayConfigError(`Payment method ${method.code} doesn't use CHIP or Billplz.`);
    }

    /**
     * Keeps a paid status just fetched from the gateway, so recording it doesn't ask the gateway again
     * (and doesn't wait on the network while the order is locked).
     */
    rememberPaid(code: HostedGatewayCode, account: string, status: GatewayPaymentStatus) {
        if (status.state !== 'paid') return;
        const now = Date.now();
        for (const [key, entry] of this.recentlyPaid) if (now - entry.at > RECENTLY_PAID_MS) this.recentlyPaid.delete(key);
        this.recentlyPaid.set(`${code}|${account}|${status.id}`, { status, at: now });
    }

    /** A paid status remembered within the last minute, handed out once. */
    takeRecentlyPaid(code: HostedGatewayCode, account: string, reference: string): GatewayPaymentStatus | undefined {
        const key = `${code}|${account}|${reference}`;
        const entry = this.recentlyPaid.get(key);
        this.recentlyPaid.delete(key);
        return entry && Date.now() - entry.at <= RECENTLY_PAID_MS ? entry.status : undefined;
    }
}
