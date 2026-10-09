/**
 * How enquiries are worded for staff: in the email, and in the dashboard through `Enquiry.detailRows`.
 * (The dashboard is a separate TypeScript project and can't import this file; its few labels mirror these.)
 */

export const ENQUIRY_STATUSES = ['new', 'in_progress', 'quoted', 'confirmed', 'closed'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const STATUS_LABELS: Record<EnquiryStatus, string> = {
    new: 'New',
    in_progress: 'In progress',
    quoted: 'Quoted',
    confirmed: 'Confirmed',
    closed: 'Closed',
};

type DetailValue = string | number | boolean | Array<string | number | boolean> | { [key: string]: DetailValue };

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "budgetPerGift" → "budget per gift" */
export const humanise = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();

/** "semi-customised" → "Semi-customised" */
export const typeLabel = (type: string) => capitalise(type.replace(/_/g, ' '));

function detailText(value: DetailValue): string {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(v => detailText(v)).join(', ');
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const date = new Date(`${value}T00:00:00Z`);
        return new Intl.DateTimeFormat('en-MY', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    }
    return String(value);
}

/** The form's answers as label / value rows; grouped answers (e.g. customisation) become "Customisation: card message". */
export function detailRows(details: Record<string, DetailValue> | null | undefined, prefix = ''): Array<{ label: string; value: string }> {
    const rows: Array<{ label: string; value: string }> = [];
    for (const [key, value] of Object.entries(details ?? {})) {
        const label = prefix ? `${prefix}: ${humanise(key)}` : capitalise(humanise(key));
        if (value && typeof value === 'object' && !Array.isArray(value)) rows.push(...detailRows(value, label));
        else rows.push({ label, value: detailText(value) });
    }
    return rows;
}

/** WhatsApp chat with the customer, opened with a greeting that names the enquiry. */
export function whatsappLink(phone: string, name: string, code: string) {
    const firstName = name.trim().split(/\s+/)[0];
    const text = `Hello ${firstName}, thank you for your enquiry ${code}.`;
    return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string, code: string) {
    return `mailto:${email}?subject=${encodeURIComponent(`Your enquiry ${code}`)}`;
}
