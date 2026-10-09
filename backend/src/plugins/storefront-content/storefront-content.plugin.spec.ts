import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STOREFRONT_FIELDS } from './content';
import { storefrontContentFields } from './storefront-content.plugin';

describe('storefront content fields', () => {
    it('are the contract’s fields: public, labelled and on the Storefront page', () => {
        assert.deepEqual(
            storefrontContentFields.map(f => f.name),
            [...STOREFRONT_FIELDS],
        );
        for (const field of storefrontContentFields) {
            assert.notEqual(field.public, false, `${field.name} is readable on the Shop API`);
            assert.equal((field.ui as { storefront?: boolean }).storefront, true, `${field.name} is on the Storefront page`);
            assert.ok(field.label?.length && field.description?.length, `${field.name} has a label and help text`);
        }
    });

    it('check values when staff save them', async () => {
        const validate = (name: string, value: unknown) => {
            const field = storefrontContentFields.find(f => f.name === name) as { validate?: (value: unknown) => unknown };
            return field.validate?.(value);
        };
        assert.match(String(await validate('whatsappNumber', '012-345 6789')), /digits only/);
        assert.equal(await validate('whatsappNumber', '601128691092'), undefined);
        assert.match(String(await validate('heroEyebrow', 'x'.repeat(61))), /60 characters/);
        assert.equal(await validate('featuredCollectionSlug', null), undefined);
    });
});
