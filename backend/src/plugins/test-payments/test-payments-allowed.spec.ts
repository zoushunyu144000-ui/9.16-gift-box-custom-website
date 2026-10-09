import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testPaymentsAllowedHere } from './test-payments-allowed';

test('test payments work in development', () => {
    assert.equal(testPaymentsAllowedHere({ APP_ENV: 'dev' }), true);
});

test('test payments are refused on a live shop unless allowed on purpose', () => {
    assert.equal(testPaymentsAllowedHere({ APP_ENV: 'production' }), false);
    assert.equal(testPaymentsAllowedHere({}), false);
    assert.equal(testPaymentsAllowedHere({ APP_ENV: 'production', ALLOW_TEST_PAYMENTS: 'true' }), true);
    assert.equal(testPaymentsAllowedHere({ APP_ENV: 'production', ALLOW_TEST_PAYMENTS: '1' }), false);
});
