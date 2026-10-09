import { LanguageCode, PaymentMethodEligibilityChecker } from '@vendure/core';

/** Whether test payments may be used here: in development, or where ALLOW_TEST_PAYMENTS=true is set on purpose. */
export function testPaymentsAllowedHere(env: NodeJS.ProcessEnv = process.env) {
    return env.APP_ENV === 'dev' || env.ALLOW_TEST_PAYMENTS === 'true';
}

/**
 * A test payment (Vendure's dummy handler) marks an order paid without any money changing hands.
 * Put on the test payment method, this checker makes it unusable on a live shop even if someone
 * leaves the method enabled: the backend then refuses it ("not eligible").
 */
export const testPaymentsAllowed = new PaymentMethodEligibilityChecker({
    code: 'test-payments-allowed',
    description: [{ languageCode: LanguageCode.en, value: 'Only in development, or with ALLOW_TEST_PAYMENTS=true' }],
    args: {},
    check: () => testPaymentsAllowedHere() || 'Test payments are switched off on this shop',
});
