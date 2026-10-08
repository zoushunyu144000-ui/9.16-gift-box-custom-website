import { LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { namesCheckoutCheck } from './names-checkout-check';
import { NamesOrderInterceptor } from './names-order-interceptor';
import { PersonalisationOptions } from './names';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

/**
 * Personalised names on gifts, charged per name.
 *
 * - Each product says whether it offers a name, what the option is called, where the name goes and how
 *   many characters fit (Product custom fields, edited in the dashboard).
 * - The customer buys names as a separate order line: the names variant (`namesSku`, one unit per name,
 *   priced at the fee per name) with the names and the gift's SKU in the line's custom fields. Staff see
 *   e.g. "Personalised name × 3 — 1. JASON 2. EMILY 3. SARAH — for spring-blessings-box".
 * - Names are checked on the server when added or changed, and again before payment.
 *
 * Pausing the service: disable the names product in the dashboard; storefronts show "Coming soon".
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    dashboard: './dashboard/index.tsx',
    configuration: config => {
        const options = PersonalisationPlugin.options;
        config.customFields.Product.push(
            {
                name: 'personalisationEnabled',
                type: 'boolean',
                defaultValue: true,
                label: en('Offers a personalised name'),
            },
            {
                name: 'personalisationLabel',
                type: 'string',
                nullable: true,
                label: en('Name option label'),
                description: en('Leave empty for “Personalised name”.'),
            },
            {
                name: 'personalisationHelper',
                type: 'string',
                nullable: true,
                label: en('Where the name goes'),
                description: en('Optional, shown above the name box, e.g. “Engraved on the lid.”'),
            },
            {
                name: 'personalisationMaxLength',
                type: 'int',
                defaultValue: options.defaultMaxLength,
                min: 1,
                max: 60,
                label: en('Characters per name'),
            },
        );
        config.customFields.OrderLine.push(
            { name: 'names', type: 'text', nullable: true, label: en('Personalised names') },
            { name: 'namesFor', type: 'string', nullable: true, label: en('Names for (gift SKU)') },
        );
        config.orderOptions.orderInterceptors = [...(config.orderOptions.orderInterceptors ?? []), new NamesOrderInterceptor(options)];
        config.orderOptions.process = [...(config.orderOptions.process ?? []), namesCheckoutCheck(options)];
        return config;
    },
})
export class PersonalisationPlugin {
    static options: PersonalisationOptions = { namesSku: 'personalised-name', defaultMaxLength: 20 };

    static init(options: Partial<PersonalisationOptions> = {}) {
        this.options = { ...this.options, ...options };
        return PersonalisationPlugin;
    }
}
