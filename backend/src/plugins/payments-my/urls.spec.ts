import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveOptions } from './options';
import { callbackUrl, checkReturnUrl, originsFrom, withOrderCode } from './urls';

const allowed = originsFrom(['https://www.moireco.com/', 'http://localhost:3001, https://moireco.com']);

describe('return URLs', () => {
    it('collects storefront origins from STOREFRONT_URL and CORS_ORIGINS', () => {
        assert.deepEqual(allowed, ['https://www.moireco.com', 'http://localhost:3001', 'https://moireco.com']);
        assert.deepEqual(originsFrom([undefined, '', ' , not a url, ftp://files.example.com, https://A.Example.com:443/x']), ['https://a.example.com']);
    });

    it('accepts URLs on the storefront', () => {
        const check = checkReturnUrl('https://www.moireco.com/checkout/return?step=2#top', allowed);
        assert.ok(check.ok);
        assert.ok(checkReturnUrl('http://localhost:3001/checkout/return', allowed).ok);
    });

    it('refuses anything that would send the customer somewhere else', () => {
        for (const url of [
            'https://evil.example.com/checkout',
            'https://www.moireco.com.evil.example.com/',
            'https://www.moireco.com@evil.example.com/',
            'https://user:pw@www.moireco.com/',
            '//evil.example.com/',
            '/checkout/return',
            'javascript:alert(1)',
            'http://www.moireco.com/checkout',
            'https://www.moireco.com:8443/checkout',
            "https://www.moireco.com/it's",
            `https://www.moireco.com/${'x'.repeat(400)}`,
            '',
            undefined,
        ]) {
            const check = checkReturnUrl(url, allowed);
            assert.equal(check.ok, false, `${url} should be refused`);
        }
        assert.equal(checkReturnUrl('https://www.moireco.com/', []).ok, false);
    });

    it('adds ?order=<code>, replacing one the storefront sent', () => {
        const check = checkReturnUrl('https://www.moireco.com/checkout/return', allowed);
        assert.ok(check.ok);
        assert.equal(withOrderCode(check.url, 'ABC123'), 'https://www.moireco.com/checkout/return?order=ABC123');
        const withQuery = checkReturnUrl('https://www.moireco.com/return?step=done&order=FAKE#paid', allowed);
        assert.ok(withQuery.ok);
        assert.equal(withOrderCode(withQuery.url, 'ABC123'), 'https://www.moireco.com/return?step=done&order=ABC123#paid');
    });

    it('builds the callback URLs gateways are given', () => {
        assert.equal(callbackUrl('https://api.moireco.com', 'chip', 'chip'), 'https://api.moireco.com/payments/chip/callback?method=chip');
        assert.equal(
            callbackUrl('https://moireco.com/backend/', 'billplz', 'billplz sandbox'),
            'https://moireco.com/backend/payments/billplz/callback?method=billplz+sandbox',
        );
    });
});

describe('plugin options', () => {
    it('defaults to VENDURE_PUBLIC_URL, STOREFRONT_URL and CORS_ORIGINS', () => {
        const options = resolveOptions({}, {
            VENDURE_PUBLIC_URL: 'https://api.moireco.com/',
            STOREFRONT_URL: 'https://www.moireco.com',
            CORS_ORIGINS: 'https://moireco.com,https://www.moireco.com',
        } as NodeJS.ProcessEnv);
        assert.equal(options.publicUrl, 'https://api.moireco.com');
        assert.equal(options.publicUrlSet, true);
        assert.deepEqual(options.allowedReturnOrigins, ['https://www.moireco.com', 'https://moireco.com']);
        assert.equal(options.statusCheckIntervalMs, 10_000);
    });

    it('falls back to this machine when no public address is set, and says so', () => {
        const options = resolveOptions({}, { VENDURE_SERVER_PORT: '3011', VENDURE_PUBLIC_URL: 'not a url' } as NodeJS.ProcessEnv);
        assert.equal(options.publicUrl, 'http://localhost:3011');
        assert.equal(options.publicUrlSet, false);
        assert.deepEqual(options.allowedReturnOrigins, []);
    });

    it('lets the plugin options win over the environment', () => {
        const options = resolveOptions(
            { publicUrl: 'https://pay.example.com', allowedReturnOrigins: ['https://shop.example.com'] },
            { VENDURE_PUBLIC_URL: 'https://api.moireco.com', STOREFRONT_URL: 'https://www.moireco.com' } as NodeJS.ProcessEnv,
        );
        assert.equal(options.publicUrl, 'https://pay.example.com');
        assert.deepEqual(options.allowedReturnOrigins, ['https://shop.example.com']);
    });
});
