import { LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';

export interface GiftMessageOptions {
    maxLength: number;
}

/**
 * A message printed on the card inside each gift: an order line custom field, so every gift in the bag
 * can carry its own message (the same gift with two different messages is two lines).
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    dashboard: './dashboard/index.tsx',
    configuration: config => {
        const { maxLength } = GiftMessagePlugin.options;
        config.customFields.OrderLine.push({
            name: 'giftMessage',
            type: 'text',
            nullable: true,
            label: [{ languageCode: LanguageCode.en, value: 'Gift message' }],
            validate: (value: string | null) => (value && value.length > maxLength ? `Gift messages are limited to ${maxLength} characters.` : undefined),
        });
        return config;
    },
})
export class GiftMessagePlugin {
    static options: GiftMessageOptions = { maxLength: 200 };

    static init(options: Partial<GiftMessageOptions> = {}) {
        this.options = { ...this.options, ...options };
        return GiftMessagePlugin;
    }
}
