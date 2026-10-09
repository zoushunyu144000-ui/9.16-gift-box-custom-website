import { EmailEventListener } from '@vendure/email-plugin';
import { EnquiriesOptions } from './constants';
import { Enquiry } from './enquiry.entity';
import { EnquirySubmittedEvent } from './enquiry-submitted.event';
import { detailRows, typeLabel, whatsappLink } from './format';

export const ENQUIRY_EMAIL_TYPE = 'enquiry-submitted';

const money = (sen: number, currencyCode: string) =>
    new Intl.NumberFormat('en-MY', { style: 'currency', currency: currencyCode }).format(sen / 100);

const kualaLumpurTime = (date: Date) =>
    new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }).format(date);

/** Everything the email template shows, already formatted (amounts in RM, times in Malaysia). */
export function enquiryEmailVars(enquiry: Enquiry, dashboardUrl?: string) {
    return {
        code: enquiry.code,
        typeLabel: typeLabel(enquiry.type),
        typeName: enquiry.type.replace(/_/g, ' '),
        receivedAt: kualaLumpurTime(enquiry.createdAt ?? new Date()),
        contactLabel: enquiry.contactCompany ? `${enquiry.contactName}, ${enquiry.contactCompany}` : enquiry.contactName,
        contactName: enquiry.contactName,
        contactCompany: enquiry.contactCompany,
        contactEmail: enquiry.contactEmail,
        contactPhone: enquiry.contactPhone,
        whatsappUrl: whatsappLink(enquiry.contactPhone, enquiry.contactName, enquiry.code),
        items: enquiry.items.map(item => ({
            quantity: item.quantity,
            name: item.variantName && item.variantName !== item.productName ? `${item.productName} – ${item.variantName}` : item.productName,
            sku: item.sku,
            unitPrice: money(item.unitPriceWithTax, enquiry.currencyCode),
            lineTotal: money(item.unitPriceWithTax * item.quantity, enquiry.currencyCode),
        })),
        totalQuantity: enquiry.totalQuantity,
        itemsTotal: money(enquiry.itemsTotalWithTax, enquiry.currencyCode),
        details: detailRows(enquiry.details),
        dashboardLink: dashboardUrl ? `${dashboardUrl.replace(/\/$/, '')}/enquiries/${enquiry.id}` : null,
    };
}

const mockEnquiry = {
    id: 1,
    createdAt: new Date(),
    code: 'ENQ-7G4K2',
    type: 'semi-customised',
    contactName: 'Sarah Tan',
    contactCompany: 'Acme Sdn Bhd',
    contactEmail: 'sarah@acme.com.my',
    contactPhone: '+60123456789',
    items: [{ productVariantId: 3, productName: 'Spring Blessings Box', variantName: 'Spring Blessings Box', sku: 'spring-blessings-box', quantity: 40, unitPriceWithTax: 18800 }],
    totalQuantity: 40,
    itemsTotalWithTax: 752000,
    currencyCode: 'MYR',
    details: { customisation: { companyNameOnCard: 'Acme', logoOnPackaging: true }, deliveryDate: '2027-01-20', deliveryAddress: 'Menara Acme, Jalan Ampang\n50450 Kuala Lumpur' },
} as unknown as Enquiry;

/**
 * Emails the shop about each new enquiry, with Reply-To set to the customer so staff can answer straight
 * from their inbox. Several addresses can be given, separated by commas.
 */
export function enquiryEmailHandler(options: EnquiriesOptions) {
    const recipient = () => options.notifyEmail || process.env.SHOP_NOTIFY_EMAIL || '';
    const dashboardUrl =
        options.dashboardUrl || (process.env.VENDURE_PUBLIC_URL ? `${process.env.VENDURE_PUBLIC_URL.replace(/\/$/, '')}/dashboard` : undefined);
    return (
        new EmailEventListener(ENQUIRY_EMAIL_TYPE)
            .on(EnquirySubmittedEvent)
            .filter(() => !!recipient())
            .setRecipient(() => recipient())
            .setFrom('{{ fromAddress }}')
            // Triple braces: the subject is plain text, so "Lim & Tan" must not become "Lim &amp; Tan".
            .setSubject('New {{{ typeName }}} enquiry {{{ code }}} from {{{ contactLabel }}}')
            .setOptionalAddressFields(event => ({ replyTo: event.enquiry.contactEmail }))
            .setTemplateVars(event => enquiryEmailVars(event.enquiry, dashboardUrl))
            .setMockEvent({ enquiry: mockEnquiry, createdAt: new Date() })
    );
}
