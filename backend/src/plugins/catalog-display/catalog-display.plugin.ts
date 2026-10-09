import { LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

/**
 * Small display controls storefronts need and Vendure doesn't have: a one-line summary for cards,
 * a homepage "featured" flag, a manual sort order, a note shown when a product is sold out
 * (e.g. "Season ended"), a one-line note under each option (e.g. "Adds a bottle of red wine"), and a
 * "was" price shown crossed out next to a lower price (a sale).
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    configuration: config => {
        config.customFields.Product.push(
            { name: 'summary', type: 'string', length: 300, nullable: true, label: en('One-line summary'), description: en('Shown on product cards and lists.') },
            { name: 'featured', type: 'boolean', defaultValue: false, label: en('Featured on the homepage') },
            { name: 'sortOrder', type: 'int', defaultValue: 100, label: en('Sort order'), description: en('Lower numbers are listed first.') },
            {
                name: 'availabilityNote',
                type: 'string',
                nullable: true,
                label: en('Note when sold out'),
                description: en('Shown instead of “Sold Out”, e.g. “Season ended”.'),
            },
        );
        config.customFields.ProductVariant.push(
            {
                name: 'note',
                type: 'string',
                nullable: true,
                label: en('Option note'),
                description: en('One line under the option, e.g. “Adds a bottle of red wine, 750 ml”.'),
            },
            {
                name: 'compareAtPrice',
                type: 'float',
                nullable: true,
                min: 0,
                label: en('Was price (RM)'),
                description: en('For a sale: the earlier price, shown crossed out when it is higher than the price, e.g. 228. Leave empty when not on sale.'),
            },
        );
        return config;
    },
})
export class CatalogDisplayPlugin {}
