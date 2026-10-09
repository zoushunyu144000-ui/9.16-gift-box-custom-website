import { FetchLike } from './gateways/types';
import { originsFrom } from './urls';

export const loggerCtx = 'PaymentsMy';
export const PAYMENTS_MY_OPTIONS = Symbol('PAYMENTS_MY_OPTIONS');

/** Handler codes of the hosted-payment gateways (also the default payment method codes). */
export const HOSTED_GATEWAYS = ['chip', 'billplz'] as const;
export type HostedGatewayCode = (typeof HOSTED_GATEWAYS)[number];

export function isHostedGateway(code: string): code is HostedGatewayCode {
    return (HOSTED_GATEWAYS as readonly string[]).includes(code);
}

export function gatewayLabel(code: string): string {
    return code === 'chip' ? 'CHIP' : code === 'billplz' ? 'Billplz' : code;
}

export interface PaymentsMyOptions {
    /** This server's public address, which gateways call back to. Default: VENDURE_PUBLIC_URL. */
    publicUrl?: string;
    /** Storefront origins customers may return to after paying. Default: STOREFRONT_URL and CORS_ORIGINS. */
    allowedReturnOrigins?: string[];
    /** How long to wait for a gateway, in ms. Default 15 000. */
    gatewayTimeoutMs?: number;
    /**
     * hostedPaymentStatus asks a gateway about the same payment at most this often, in ms; callbacks still
     * record payments straight away. Billplz limits status requests, so keep it at several seconds. Default 10 000.
     */
    statusCheckIntervalMs?: number;
    /** For tests: the fetch used to call gateways. */
    fetch?: FetchLike;
}

export interface ResolvedPaymentsMyOptions {
    publicUrl: string;
    /** False when neither the option nor VENDURE_PUBLIC_URL gave a usable address (callbacks then can't reach us). */
    publicUrlSet: boolean;
    allowedReturnOrigins: string[];
    gatewayTimeoutMs: number;
    statusCheckIntervalMs: number;
    fetch?: FetchLike;
}

/** Fills in defaults from the environment, read when the server starts (after .env is loaded). */
export function resolveOptions(options: PaymentsMyOptions, env: NodeJS.ProcessEnv = process.env): ResolvedPaymentsMyOptions {
    const configured = (options.publicUrl ?? env.VENDURE_PUBLIC_URL ?? '').trim();
    const publicUrl = originsFrom([configured]).length ? configured.replace(/\/+$/, '') : '';
    const port = env.PORT || env.VENDURE_SERVER_PORT || '3000';
    return {
        publicUrl: publicUrl || `http://localhost:${port}`,
        publicUrlSet: Boolean(publicUrl),
        allowedReturnOrigins: originsFrom(options.allowedReturnOrigins ?? [env.STOREFRONT_URL, env.CORS_ORIGINS]),
        gatewayTimeoutMs: options.gatewayTimeoutMs ?? 15_000,
        statusCheckIntervalMs: options.statusCheckIntervalMs ?? 10_000,
        fetch: options.fetch,
    };
}
