import { CustomFieldConfig, LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { checkField, StorefrontTextField } from './content';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

/**
 * Groups the fields under headings in the dashboard, and `storefront: true` puts them on its Settings →
 * Storefront page. Without a component the dashboard uses its usual input for the field's type, which is
 * what we want for everything except long texts and the collection picker.
 */
const ui = (tab: string, component?: string) => ({ tab, storefront: true, ...(component ? { component } : {}) }) as CustomFieldConfig['ui'];

/** A text field for staff, checked by content.ts; a refusal starts with the field's label so it's clear which one. */
function textField(
    name: StorefrontTextField,
    label: string,
    description: string,
    tab: string,
    options: { long?: boolean; component?: string } = {},
): CustomFieldConfig {
    return {
        name,
        type: options.long ? 'text' : 'string',
        nullable: true,
        label: en(label),
        description: en(description),
        ui: ui(tab, options.component ?? (options.long ? 'textarea-form-input' : undefined)),
        validate: (value: unknown) => {
            const problem = checkField(name, value);
            return problem ? `${label}: ${problem}` : undefined;
        },
    } as CustomFieldConfig;
}

export const storefrontContentFields: CustomFieldConfig[] = [
    textField('heroEyebrow', 'Small heading', 'A short line above the headline, e.g. “Chinese New Year 2027”. Leave empty for none.', 'Homepage banner'),
    textField('heroTitle', 'Headline', 'Shown large over the photographs. Use / for a new line, e.g. “More than a gift / A memory”.', 'Homepage banner'),
    textField('heroText', 'Introduction', 'One or two sentences under the headline.', 'Homepage banner', { long: true }),
    textField(
        'featuredCollectionSlug',
        'Collection in the spotlight',
        'Its gifts lead the homepage, e.g. the festival in season. Choose “None” between seasons.',
        'Featured collection',
        { component: 'storefront-collection-slug-input' },
    ),
    textField('featuredTitle', 'Section title', 'The heading above those gifts, e.g. “Chinese New Year 2027”.', 'Featured collection'),
    textField('featuredIntro', 'Section introduction', 'A sentence or two under the heading.', 'Featured collection', { long: true }),
    textField('whatsappNumber', 'WhatsApp number', 'Used by the WhatsApp buttons. Digits only, starting with the country code, e.g. 60123456789.', 'Contact'),
    textField('contactEmail', 'Email address', 'Shown to customers. Optional.', 'Contact'),
    textField('businessHours', 'Business hours', 'Shown in the footer and on the order confirmation, e.g. “Mon–Sat, 10am–6pm”. Optional.', 'Contact'),
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
