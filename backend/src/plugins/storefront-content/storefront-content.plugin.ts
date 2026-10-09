import { CustomFieldConfig, LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { checkField, StorefrontContent } from './content';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

/**
 * Groups the fields under headings in the dashboard. Without a component the dashboard uses its usual input
 * for the field's type, which is what we want for everything except long texts and the collection picker.
 */
const ui = (tab: string, component?: string) => (component ? { tab, component } : { tab }) as CustomFieldConfig['ui'];

const validate = (field: keyof StorefrontContent) => (value: unknown) => checkField(field, value);

export const storefrontContentFields: CustomFieldConfig[] = [
    {
        name: 'heroEyebrow',
        type: 'string',
        nullable: true,
        label: en('Small heading'),
        description: en('A short line above the headline, e.g. “Chinese New Year 2027”. Leave empty for none.'),
        ui: ui('Homepage banner'),
        validate: validate('heroEyebrow'),
    },
    {
        name: 'heroTitle',
        type: 'string',
        nullable: true,
        label: en('Headline'),
        description: en('Shown large over the photographs. Use / for a new line, e.g. “More than a gift / A memory”.'),
        ui: ui('Homepage banner'),
        validate: validate('heroTitle'),
    },
    {
        name: 'heroText',
        type: 'text',
        nullable: true,
        label: en('Introduction'),
        description: en('One or two sentences under the headline.'),
        ui: ui('Homepage banner', 'textarea-form-input'),
        validate: validate('heroText'),
    },
    {
        name: 'featuredCollectionSlug',
        type: 'string',
        nullable: true,
        label: en('Collection in the spotlight'),
        description: en('Its gifts lead the homepage, e.g. the festival in season. Choose “None” between seasons.'),
        ui: ui('Featured collection', 'storefront-collection-slug-input'),
        validate: validate('featuredCollectionSlug'),
    },
    {
        name: 'featuredTitle',
        type: 'string',
        nullable: true,
        label: en('Section title'),
        description: en('The heading above those gifts, e.g. “Chinese New Year 2027”.'),
        ui: ui('Featured collection'),
        validate: validate('featuredTitle'),
    },
    {
        name: 'featuredIntro',
        type: 'text',
        nullable: true,
        label: en('Section introduction'),
        description: en('A sentence or two under the heading.'),
        ui: ui('Featured collection', 'textarea-form-input'),
        validate: validate('featuredIntro'),
    },
    {
        name: 'whatsappNumber',
        type: 'string',
        nullable: true,
        label: en('WhatsApp number'),
        description: en('Used by the WhatsApp buttons. Digits only, starting with the country code, e.g. 60123456789.'),
        ui: ui('Contact'),
        validate: validate('whatsappNumber'),
    },
    {
        name: 'contactEmail',
        type: 'string',
        nullable: true,
        label: en('Email address'),
        description: en('Shown to customers. Optional.'),
        ui: ui('Contact'),
        validate: validate('contactEmail'),
    },
    {
        name: 'businessHours',
        type: 'string',
        nullable: true,
        label: en('Business hours'),
        description: en('Shown in the footer and on the order confirmation, e.g. “Mon–Sat, 10am–6pm”. Optional.'),
        ui: ui('Contact'),
        validate: validate('businessHours'),
    },
    {
        name: 'showPreviewNotice',
        type: 'boolean',
        nullable: false,
        // A new shop starts as a preview (test payments) until the owner turns this off at launch.
        defaultValue: true,
        label: en('Show the preview notice'),
        description: en('Tells visitors the site is a preview with test payments. Turn it off when the shop goes live.'),
        ui: ui('Notices'),
    },
];

/**
 * Shop texts and contact details that staff edit in the dashboard (Settings → Storefront) and the storefront
 * reads from the Shop API: `activeChannel { customFields { heroTitle whatsappNumber … } }`.
 *
 * They live on the Channel, so a server hosting several shops (one channel each) keeps them apart.
 * `setupStorefrontContent()` (setup.ts) writes a new shop's first values.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    dashboard: './dashboard/index.tsx',
    configuration: config => {
        config.customFields.Channel.push(...storefrontContentFields);
        return config;
    },
})
export class StorefrontContentPlugin {
    static init() {
        return StorefrontContentPlugin;
    }
}
