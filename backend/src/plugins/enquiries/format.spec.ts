import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detailRows, mailtoLink, typeLabel, whatsappLink } from './format';

describe('enquiry wording for staff', () => {
    it('labels types and details in plain English', () => {
        assert.equal(typeLabel('semi-customised'), 'Semi-customised');
        assert.equal(typeLabel('fully_customised'), 'Fully customised');
        assert.deepEqual(
            detailRows({
                style: 'Festive hamper',
                budgetPerGift: 'RM 150–200',
                deliveryDate: '2027-01-20',
                multipleAddresses: false,
                customisation: { cardMessage: 'Happy New Year', logoOnPackaging: true },
                addresses: ['KL', 'Penang'],
            }),
            [
                { label: 'Style', value: 'Festive hamper' },
                { label: 'Budget per gift', value: 'RM 150–200' },
                { label: 'Delivery date', value: 'Wed, 20 January 2027' },
                { label: 'Multiple addresses', value: 'No' },
                { label: 'Customisation: card message', value: 'Happy New Year' },
                { label: 'Customisation: logo on packaging', value: 'Yes' },
                { label: 'Addresses', value: 'KL, Penang' },
            ],
        );
        assert.deepEqual(detailRows(null), []);
    });

    it('links to WhatsApp and email with the reference filled in', () => {
        assert.equal(
            whatsappLink('+60123456789', 'Sarah Tan', 'ENQ-7G4K2'),
            'https://wa.me/60123456789?text=Hello%20Sarah%2C%20thank%20you%20for%20your%20enquiry%20ENQ-7G4K2.',
        );
        assert.equal(mailtoLink('sarah@acme.com.my', 'ENQ-7G4K2'), 'mailto:sarah@acme.com.my?subject=Your%20enquiry%20ENQ-7G4K2');
    });
});
