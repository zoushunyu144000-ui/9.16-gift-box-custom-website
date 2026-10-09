import { PermissionDefinition } from '@vendure/core';

export { ENQUIRY_STATUSES } from './format';
export type { EnquiryStatus } from './format';

export const ENQUIRIES_PLUGIN_OPTIONS = Symbol('ENQUIRIES_PLUGIN_OPTIONS');
export const loggerCtx = 'EnquiriesPlugin';

// Two separate permissions rather than CRUD: enquiries are only created by customers and never deleted
// from the dashboard. The dashboard's role editor still shows them together as "Enquiry: Read, Update".
export const readEnquiryPermission = new PermissionDefinition({
    name: 'ReadEnquiry',
    description: 'Grants permission to read corporate enquiries',
});
export const updateEnquiryPermission = new PermissionDefinition({
    name: 'UpdateEnquiry',
    description: 'Grants permission to update corporate enquiries (status and internal notes)',
});

export interface EnquiriesOptions {
    /**
     * Where the "new enquiry" email goes. Defaults to the SHOP_NOTIFY_EMAIL environment variable; with
     * neither set, no email is sent (enquiries still appear in the dashboard).
     */
    notifyEmail?: string;
    /** Start of every reference, e.g. ENQ gives ENQ-7G4K2. Capital letters and digits. */
    codePrefix: string;
    /** When set, only these enquiry types are accepted (e.g. ['semi-customised', 'fully-customised']). */
    types?: string[];
    /**
     * Enquiries accepted per IP address in the time window, against scripts filling the inbox. Set false
     * if the storefront sends enquiries from its own server without passing on the customer's address
     * (X-Forwarded-For with Vendure's `apiOptions.trustProxy`), since every enquiry would then share one address.
     */
    rateLimit: { limit: number; windowMinutes: number } | false;
    /** Base URL of the dashboard for the link in the email. Defaults to VENDURE_PUBLIC_URL + /dashboard when that is set. */
    dashboardUrl?: string;
}
