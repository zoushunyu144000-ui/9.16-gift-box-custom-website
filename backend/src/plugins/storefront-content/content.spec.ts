import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkEmail, checkField, checkSlug, checkWhatsappNumber, normaliseStorefrontContent } from './content';

describe('storefront content rules', () => {
    it('takes a WhatsApp number as digits with the country code', () => {
        assert.equal(checkWhatsappNumber('601128691092'), undefined);
        assert.equal(checkWhatsappNumber('6591234567'), undefined);
        assert.equal(checkWhatsappNumber(''), undefined, 'empty is allowed (no WhatsApp buttons)');
        assert.equal(checkWhatsappNumber(null), undefined);
    });

    it('explains what is wrong with a WhatsApp number', () => {
        assert.match(checkWhatsappNumber('+60 12-345 6789') ?? '', /digits only/);
        assert.match(checkWhatsappNumber('0123456789') ?? '', /country code instead of 0/);
        assert.match(checkWhatsappNumber('6012') ?? '', /full phone number/);
        assert.match(checkWhatsappNumber('6012345678901234') ?? '', /full phone number/);
    });

    it('checks emails and collection slugs only when given', () => {
        assert.equal(checkEmail('hello@moire.co'), undefined);
        assert.equal(checkEmail(''), undefined);
        assert.ok(checkEmail('hello@moire'));
        assert.equal(checkSlug('chinese-new-year'), undefined);
        assert.ok(checkSlug('Chinese New Year'));
        assert.ok(checkSlug('chinese--new-year'));
    });

    it('keeps texts within the room the storefront gives them', () => {
        assert.equal(checkField('heroTitle', 'More than a gift / A memory'), undefined);
        assert.match(checkField('heroTitle', 'x'.repeat(81)) ?? '', /80 characters \(it has 81\)/);
        assert.equal(checkField('heroText', 'x'.repeat(300)), undefined);
        assert.ok(checkField('showPreviewNotice', 'yes'));
        assert.equal(checkField('showPreviewNotice', false), undefined);
    });

    it('tidies content given in code and reports every problem', () => {
        const ok = normaliseStorefrontContent({ heroTitle: '  More than a gift / A memory ', contactEmail: '', whatsappNumber: '+60 11-2869 1092' });
        assert.deepEqual(ok.problems, []);
        assert.deepEqual(ok.content, { heroTitle: 'More than a gift / A memory', contactEmail: null, whatsappNumber: '601128691092' });

        const bad = normaliseStorefrontContent({ festiveTitle: 'Chinese New Year 2027', whatsappNumber: '011-2869 1092', showPreviewNotice: 'true' });
        assert.equal(bad.problems.length, 3);
        assert.match(bad.problems[0], /festiveTitle: not a storefront field/);
        assert.match(bad.problems[1], /whatsappNumber: Start with the country code/);
        assert.match(bad.problems[2], /showPreviewNotice/);
        assert.deepEqual(bad.content, {});
    });
});
