import { INestApplicationContext } from '@nestjs/common';
import { LanguageCode, PaymentMethodService, RequestContext } from '@vendure/core';

export interface ChipSetupOptions {
    /** The code the storefront passes to createHostedPayment. Default "chip". */
    code?: string;
    name?: string;
    description?: string;
    /** Default: CHIP_BRAND_ID. */
    brandId?: string;
    /** Default: CHIP_SECRET_KEY. */
    secretKey?: string;
    /** Comma-separated CHIP method names to offer. Default: CHIP_PAYMENT_METHODS, else everything the account has. */
    paymentMethodWhitelist?: string;
    apiBaseUrl?: string;
}

export interface BillplzSetupOptions {
    /** Default "billplz". */
    code?: string;
    name?: string;
    description?: string;
    /** Default: BILLPLZ_API_KEY. */
    apiKey?: string;
    /** Default: BILLPLZ_COLLECTION_ID. */
    collectionId?: string;
    /** Default: BILLPLZ_X_SIGNATURE_KEY. */
    xSignatureKey?: string;
    /** Default: BILLPLZ_SANDBOX=true. */
    sandbox?: boolean;
    apiBaseUrl?: string;
}

export interface PaymentMethodsSetupOptions {
    /** false leaves CHIP out. */
    chip?: ChipSetupOptions | false;
    /** false leaves Billplz out. */
    billplz?: BillplzSetupOptions | false;
    /** Language of the names customers see. Default: the channel's default language. */
    languageCode?: LanguageCode;
    /** Where keys default from. Default: process.env. */
    env?: NodeJS.ProcessEnv;
}

export interface PaymentMethodSetupResult {
    code: string;
    handler: 'chip' | 'billplz';
    /** False when a method with this code already existed; it is left as it was. */
    created: boolean;
    enabled: boolean;
    /** Settings to fill in under Settings → Payment methods before the method can be switched on. */
    missing: string[];
}

interface MethodDefinition {
    handler: 'chip' | 'billplz';
    code: string;
    name: string;
    description: string;
    args: Record<string, string>;
    required: string[];
}

/**
 * Creates the CHIP and Billplz payment methods in ctx's channel, e.g. while setting up a new shop. A method
 * whose keys are missing is created switched off, for the owner to complete in the dashboard; methods that
 * already exist are left alone, so it is safe to run again.
 */
export async function setupPaymentMethods(
    app: INestApplicationContext,
    ctx: RequestContext,
    opts: PaymentMethodsSetupOptions = {},
): Promise<PaymentMethodSetupResult[]> {
    const env = opts.env ?? process.env;
    const definitions: MethodDefinition[] = [];
    if (opts.chip !== false) {
        const chip = opts.chip ?? {};
        definitions.push({
            handler: 'chip',
            code: chip.code ?? 'chip',
            name: chip.name ?? 'Online banking, card or e-wallet',
            description: chip.description ?? 'Pay on CHIP’s secure page with FPX online banking, DuitNow QR, a debit or credit card, or an e-wallet.',
            args: {
                brandId: chip.brandId ?? env.CHIP_BRAND_ID ?? '',
                secretKey: chip.secretKey ?? env.CHIP_SECRET_KEY ?? '',
                paymentMethodWhitelist: chip.paymentMethodWhitelist ?? env.CHIP_PAYMENT_METHODS ?? '',
                apiBaseUrl: chip.apiBaseUrl ?? '',
            },
            required: ['brandId', 'secretKey'],
        });
    }
    if (opts.billplz !== false) {
        const billplz = opts.billplz ?? {};
        definitions.push({
            handler: 'billplz',
            code: billplz.code ?? 'billplz',
            name: billplz.name ?? 'Online banking (FPX)',
            description: billplz.description ?? 'Pay on Billplz’s secure page with your bank’s FPX online banking.',
            args: {
                apiKey: billplz.apiKey ?? env.BILLPLZ_API_KEY ?? '',
                collectionId: billplz.collectionId ?? env.BILLPLZ_COLLECTION_ID ?? '',
                xSignatureKey: billplz.xSignatureKey ?? env.BILLPLZ_X_SIGNATURE_KEY ?? '',
                sandbox: String(billplz.sandbox ?? env.BILLPLZ_SANDBOX === 'true'),
                apiBaseUrl: billplz.apiBaseUrl ?? '',
            },
            required: ['apiKey', 'collectionId', 'xSignatureKey'],
        });
    }

    const service = app.get(PaymentMethodService);
    const languageCode = opts.languageCode ?? ctx.channel.defaultLanguageCode;
    const results: PaymentMethodSetupResult[] = [];
    for (const definition of definitions) {
        const { code, handler } = definition;
        const existing = (await service.findAll(ctx, { filter: { code: { eq: code } } })).items[0];
        if (existing) {
            const saved = Object.fromEntries(existing.handler.args.map(arg => [arg.name, arg.value]));
            const missing = existing.handler.code === handler ? definition.required.filter(name => !saved[name]?.trim()) : [];
            results.push({ code, handler, created: false, enabled: existing.enabled, missing });
            continue;
        }
        const missing = definition.required.filter(name => !definition.args[name].trim());
        await service.create(ctx, {
            code,
            enabled: missing.length === 0,
            handler: { code: handler, arguments: Object.entries(definition.args).map(([name, value]) => ({ name, value: value.trim() })) },
            translations: [{ languageCode, name: definition.name, description: definition.description }],
        });
        results.push({ code, handler, created: true, enabled: missing.length === 0, missing });
    }
    return results;
}
