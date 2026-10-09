import { LanguageCode } from '@vendure/core';

export const DELIVERY_MY_OPTIONS = Symbol('DELIVERY_MY_OPTIONS');
export const loggerCtx = 'MalaysianDeliveryPlugin';

/** An English label or description for the dashboard. */
export const en = (value: string) => [{ languageCode: LanguageCode.en, value }];
