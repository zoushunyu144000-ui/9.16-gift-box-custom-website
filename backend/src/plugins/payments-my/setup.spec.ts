import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentMethodService } from '@vendure/core';
import { setupPaymentMethods } from './setup';

type Created = { code: string; enabled: boolean; handler: { code: string; arguments: Array<{ name: string; value: string }> }; translations: Array<{ name: string }> };
type Existing = { code: string; enabled: boolean; handler: { code: string; args: Array<{ name: string; value: string }> } };

function fakeApp(existing: Existing[] = []) {
    const created: Created[] = [];
    const service = {
        findAll: async (_ctx: unknown, options: { filter: { code: { eq: string } } }) => ({ items: existing.filter(m => m.code === options.filter.code.eq) }),
        create: async (_ctx: unknown, input: Created) => {
            created.push(input);
            return input;
        },
    };
    const app = {
        get: (token: unknown) => {
            assert.equal(token, PaymentMethodService);
            return service;
        },
    };
    return { app: app as any, created };
}

const ctx = { channel: { defaultLanguageCode: 'en' } } as any;
const argsOf = (method: Created) => Object.fromEntries(method.handler.arguments.map(a => [a.name, a.value]));

describe('setting up the payment methods', () => {
    it('creates CHIP and Billplz switched off when their keys are missing', async () => {
        const { app, created } = fakeApp();
        const results = await setupPaymentMethods(app, ctx, { env: {} as NodeJS.ProcessEnv });
        assert.deepEqual(results, [
            { code: 'chip', handler: 'chip', created: true, enabled: false, missing: ['brandId', 'secretKey'] },
            { code: 'billplz', handler: 'billplz', created: true, enabled: false, missing: ['apiKey', 'collectionId', 'xSignatureKey'] },
        ]);
        assert.deepEqual(
            created.map(m => [m.code, m.enabled, m.handler.code, Object.keys(argsOf(m))]),
            [
                ['chip', false, 'chip', ['brandId', 'secretKey', 'paymentMethodWhitelist', 'apiBaseUrl']],
                ['billplz', false, 'billplz', ['apiKey', 'collectionId', 'xSignatureKey', 'sandbox', 'apiBaseUrl']],
            ],
        );
        assert.equal(created[1].translations[0].name, 'Online banking (FPX)');
    });

    it('switches a method on when its keys come from the environment', async () => {
        const { app, created } = fakeApp();
        const env = {
            CHIP_BRAND_ID: 'brand-1',
            CHIP_SECRET_KEY: ' sk-live ',
            CHIP_PAYMENT_METHODS: 'fpx, duitnow_qr',
            BILLPLZ_API_KEY: 'key',
            BILLPLZ_COLLECTION_ID: 'col',
            BILLPLZ_X_SIGNATURE_KEY: 'S-x',
            BILLPLZ_SANDBOX: 'true',
        } as NodeJS.ProcessEnv;
        const results = await setupPaymentMethods(app, ctx, { env });
        assert.deepEqual(results.map(r => [r.code, r.enabled, r.missing.length]), [
            ['chip', true, 0],
            ['billplz', true, 0],
        ]);
        assert.deepEqual(argsOf(created[0]), { brandId: 'brand-1', secretKey: 'sk-live', paymentMethodWhitelist: 'fpx, duitnow_qr', apiBaseUrl: '' });
        assert.equal(argsOf(created[1]).sandbox, 'true');
    });

    it('lets options win over the environment, and can leave a gateway out', async () => {
        const { app, created } = fakeApp();
        const results = await setupPaymentMethods(app, ctx, {
            env: { CHIP_BRAND_ID: 'from-env' } as NodeJS.ProcessEnv,
            chip: { code: 'chip-test', brandId: 'from-options', secretKey: 'sk' },
            billplz: false,
        });
        assert.deepEqual(results, [{ code: 'chip-test', handler: 'chip', created: true, enabled: true, missing: [] }]);
        assert.equal(argsOf(created[0]).brandId, 'from-options');
    });

    it('says so when the code is already taken by a method with another handler', async () => {
        const { app, created } = fakeApp([{ code: 'chip', enabled: true, handler: { code: 'dummy-payment-handler', args: [] } }]);
        const [chip] = await setupPaymentMethods(app, ctx, { env: {} as NodeJS.ProcessEnv, billplz: false });
        assert.equal(created.length, 0);
        assert.equal(chip.handler, 'dummy-payment-handler');
        assert.match(chip.problem ?? '', /already exists with the dummy-payment-handler handler/);
    });

    it('leaves existing methods as they are, so it can run again', async () => {
        const { app, created } = fakeApp([
            { code: 'chip', enabled: true, handler: { code: 'chip', args: [{ name: 'brandId', value: 'b' }, { name: 'secretKey', value: 's' }] } },
            { code: 'billplz', enabled: false, handler: { code: 'billplz', args: [{ name: 'apiKey', value: 'k' }] } },
        ]);
        const results = await setupPaymentMethods(app, ctx, { env: { CHIP_BRAND_ID: 'new' } as NodeJS.ProcessEnv });
        assert.equal(created.length, 0);
        assert.deepEqual(results, [
            { code: 'chip', handler: 'chip', created: false, enabled: true, missing: [] },
            { code: 'billplz', handler: 'billplz', created: false, enabled: false, missing: ['collectionId', 'xSignatureKey'] },
        ]);
    });
});
