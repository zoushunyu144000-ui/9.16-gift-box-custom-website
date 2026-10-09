import { Inject, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@vendure/core';
import { BillplzClient } from './gateways/billplz';
import { ChipClient, parseChipMethods } from './gateways/chip';
import { GatewayConfigError, HostedPaymentGateway } from './gateways/types';
import { HostedGatewayCode, PAYMENTS_MY_OPTIONS, ResolvedPaymentsMyOptions } from './options';

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
    /** The shop's merchant account at the gateway (CHIP brand, Billplz collection): payments must belong to it. */
    account: string;
}

/** Builds gateway clients from payment method settings, with the plugin's timeout (and test fetch). */
@Injectable()
export class GatewayFactory {
    constructor(@Inject(PAYMENTS_MY_OPTIONS) private readonly options: ResolvedPaymentsMyOptions) {}

    chip(args: ChipArgs): ChipClient {
        return new ChipClient({
            brandId: args.brandId ?? '',
            secretKey: args.secretKey ?? '',
            paymentMethodWhitelist: parseChipMethods(args.paymentMethodWhitelist),
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
            return { code: 'chip', gateway: this.chip(args), account: (args.brandId ?? '').trim() };
        }
        if (method.handler.code === 'billplz') {
            return { code: 'billplz', gateway: this.billplz({ ...args, sandbox: args.sandbox === 'true' }), account: (args.collectionId ?? '').trim() };
        }
        throw new GatewayConfigError(`Payment method ${method.code} doesn't use CHIP or Billplz.`);
    }
}
