import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CheckOptions, checkEnquiry, EnquiryInput, normalisePhone, todayInKualaLumpur } from './validation';

const today = '2026-10-09';
const contact = { name: 'Sarah Tan', company: 'Acme Sdn Bhd', email: 'sarah@acme.com.my', phone: '012-345 6789' };

/** What the storefront's semi-customised form sends. */
const semiCustomised: EnquiryInput = {
    type: 'semi-customised',
    contact,
    items: [
        { productVariantId: '3', quantity: 40 },
        { productVariantId: '7', quantity: 10 },
    ],
    details: {
        customisation: { companyNameOnCard: 'Acme', cardMessage: 'Happy New Year!', logoOnPackaging: true, notes: '' },
        deliveryDate: '2027-01-20',
        deliveryAddress: 'Level 5, Menara Acme\nJalan Ampang, 50450 Kuala Lumpur',
        multipleAddresses: false,
        website: '',
    },
};

const check = (input: Partial<EnquiryInput>, options: CheckOptions = { today }) => checkEnquiry({ ...semiCustomised, ...input } as EnquiryInput, options);
const refusal = (input: Partial<EnquiryInput>) => {
    const result = check(input);
    assert.equal(result.ok, false, `expected a refusal for ${JSON.stringify(input)}`);
    return (result as { message: string }).message;
};

describe('enquiry checks', () => {
    it('accepts a semi-customised request and tidies it', () => {
        const result = check({});
        assert.ok(result.ok);
        const { enquiry } = result;
        assert.equal(enquiry.type, 'semi-customised');
        assert.deepEqual(enquiry.contact, { name: 'Sarah Tan', company: 'Acme Sdn Bhd', email: 'sarah@acme.com.my', phone: '+60123456789' });
        assert.equal(enquiry.items.length, 2);
        assert.deepEqual(enquiry.details, {
            customisation: { companyNameOnCard: 'Acme', cardMessage: 'Happy New Year!', logoOnPackaging: true },
            deliveryDate: '2027-01-20',
            deliveryAddress: 'Level 5, Menara Acme\nJalan Ampang, 50450 Kuala Lumpur',
            multipleAddresses: false,
        });
        assert.equal(enquiry.honeypot, false);
    });

    it('accepts a fully customised request without items', () => {
        const result = check({
            type: 'Fully-Customised',
            contact: { name: '  Lim  Wei Ming ', email: 'wm@lim.my', phone: '+60 11-2869 1092', company: '' },
            items: undefined,
            details: { style: 'Festive hamper', quantity: '50', budgetPerGift: 'RM 150–200', notes: 'Logo in gold, please.' },
        });
        assert.ok(result.ok);
        assert.equal(result.enquiry.type, 'fully-customised');
        assert.deepEqual(result.enquiry.contact, { name: 'Lim Wei Ming', company: null, email: 'wm@lim.my', phone: '+601128691092' });
        assert.deepEqual(result.enquiry.items, []);
        assert.equal(result.enquiry.details?.quantity, 50);
    });

    it('needs a name, an email and a phone number', () => {
        assert.equal(refusal({ contact: { ...contact, name: 'S' } }), 'Please enter your name.');
        assert.match(refusal({ contact: { ...contact, name: 'S'.repeat(101) } }), /under 100 characters/);
        assert.match(refusal({ contact: { ...contact, company: 'C'.repeat(121) } }), /company name under 120/);
        assert.equal(refusal({ contact: { ...contact, email: 'sarah@acme' } }), 'Please enter a valid email address.');
        assert.equal(refusal({ contact: { ...contact, email: 'sarah tan@acme.com' } }), 'Please enter a valid email address.');
        assert.match(refusal({ contact: { ...contact, phone: '12345' } }), /valid phone number/);
    });

    it('takes known enquiry types only when the shop lists them', () => {
        assert.match(refusal({ type: 'semi customised!' }), /can’t be sent here/);
        assert.match(refusal({ type: '' }), /can’t be sent here/);
        assert.ok(check({ type: 'bespoke' }).ok);
        assert.equal(check({ type: 'bespoke' }, { today, types: ['semi-customised'] }).ok, false);
    });

    it('needs whole quantities from 1 to 9,999, adding up repeated gifts', () => {
        const quantityMessage = 'Please enter a quantity between 1 and 9,999 for each gift.';
        assert.equal(refusal({ items: [{ productVariantId: '3', quantity: 0 }] }), quantityMessage);
        assert.equal(refusal({ items: [{ productVariantId: '3', quantity: 10000 }] }), quantityMessage);
        assert.equal(refusal({ items: [{ productVariantId: '3', quantity: 1.5 }] }), quantityMessage);
        assert.equal(refusal({ items: [{ productVariantId: '3', quantity: 5000 }, { productVariantId: '3', quantity: 5000 }] }), quantityMessage);
        const merged = check({ items: [{ productVariantId: '3', quantity: 5 }, { productVariantId: 3, quantity: 7 }] });
        assert.ok(merged.ok);
        assert.deepEqual(merged.enquiry.items, [{ productVariantId: '3', quantity: 12 }]);
        const tooMany = Array.from({ length: 51 }, (_, i) => ({ productVariantId: String(i + 1), quantity: 1 }));
        assert.match(refusal({ items: tooMany }), /up to 50 different gifts/);
    });

    it('checks delivery dates and the number of gifts in the details', () => {
        assert.equal(refusal({ details: { deliveryDate: '2026-10-08' } }), 'Please choose a delivery date that hasn’t passed.');
        assert.ok(check({ details: { deliveryDate: today } }).ok);
        assert.equal(refusal({ details: { deliveryDate: '2027-02-30' } }), 'Please choose a valid delivery date.');
        assert.equal(refusal({ details: { deliveryDate: '20/01/2027' } }), 'Please choose a valid delivery date.');
        assert.match(refusal({ details: { quantity: 0 } }), /how many gifts/);
        assert.match(refusal({ details: { quantity: 'fifty' } }), /how many gifts/);
    });

    it('keeps free-form details small, flat and readable', () => {
        assert.match(refusal({ details: { notes: 'x'.repeat(2001) } }), /notes under 2,000 characters/);
        assert.match(refusal({ details: { customisation: { inner: { tooDeep: true } } } }), /couldn’t read/);
        assert.match(refusal({ details: ['not', 'an', 'object'] }), /couldn’t read/);
        assert.match(refusal({ details: { 'bad key': 'x' } }), /couldn’t read/);
        const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`field${i}`, 'x']));
        assert.match(refusal({ details: many }), /couldn’t read/);
        const long = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`note${i}`, 'x'.repeat(1900)]));
        assert.match(refusal({ details: long }), /too long/);

        const tidy = check({ details: { notes: '  Ring\u0007 the bell\u0000  ', empty: '   ', nothing: null, addresses: ['KL', '', 'Penang'] } });
        assert.ok(tidy.ok);
        assert.deepEqual(tidy.enquiry.details, { notes: 'Ring the bell', addresses: ['KL', 'Penang'] });
        const none = check({ details: { website: '', notes: '' } });
        assert.ok(none.ok);
        assert.equal(none.enquiry.details, null);
    });

    it('reads input objects that GraphQL builds without a prototype', () => {
        const bare = <T extends object>(value: T): T => Object.assign(Object.create(null), value);
        const result = check({
            contact: bare({ ...contact, name: 'S' }),
            details: bare({ customisation: bare({ cardMessage: 'Hi' }) }),
        });
        assert.equal(result.ok, false);
        assert.equal((result as { message: string }).message, 'Please enter your name.');
        const ok = check({ contact: bare(contact), details: bare({ customisation: bare({ cardMessage: 'Hi' }) }) });
        assert.ok(ok.ok);
        assert.deepEqual(ok.enquiry.details, { customisation: { cardMessage: 'Hi' } });
    });

    it('spots the hidden website field that only bots fill in', () => {
        const bot = check({ details: { ...(semiCustomised.details as object), website: 'https://cheap-pills.example' } });
        assert.ok(bot.ok);
        assert.equal(bot.enquiry.honeypot, true);
        assert.equal('website' in (bot.enquiry.details ?? {}), false);
    });
});

describe('phone numbers', () => {
    it('reads Malaysian numbers written locally or with the country code', () => {
        const cases: Array<[string, string]> = [
            ['012-345 6789', '+60123456789'],
            ['0123456789', '+60123456789'],
            ['011-2869 1092', '+601128691092'],
            ['601128691092', '+601128691092'],
            ['+60 11-2869 1092', '+601128691092'],
            ['+60 012-345 6789', '+60123456789'],
            ['03-1234 5678', '+60312345678'],
            ['(03) 1234 5678', '+60312345678'],
            ['088-123 456', '+6088123456'],
        ];
        for (const [input, expected] of cases) assert.equal(normalisePhone(input), expected, input);
    });

    it('reads other countries when they come with their code', () => {
        assert.equal(normalisePhone('+65 9123 4567'), '+6591234567');
        assert.equal(normalisePhone('0065 9123 4567'), '+6591234567');
        assert.equal(normalisePhone('+1 (415) 555-0123'), '+14155550123');
    });

    it('refuses what can’t be dialled', () => {
        for (const input of ['', '12345', '91234567', '012-345', 'call me', '+0 123 456 789', '+1 234', '0123456789012345', '012-345 6789 ext 2']) {
            assert.equal(normalisePhone(input), undefined, input);
        }
    });
});

describe('dates', () => {
    it('counts today in Malaysia', () => {
        assert.equal(todayInKualaLumpur(new Date('2026-10-08T15:59:00Z')), '2026-10-08');
        assert.equal(todayInKualaLumpur(new Date('2026-10-08T16:00:00Z')), '2026-10-09');
    });
});
