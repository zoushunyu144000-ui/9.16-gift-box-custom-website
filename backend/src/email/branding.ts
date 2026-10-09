import {
    defaultEmailHandlers,
    emailAddressChangeHandler,
    emailVerificationHandler,
    GlobalTemplateVarsFn,
    orderConfirmationHandler,
    passwordResetHandler,
} from '@vendure/email-plugin';

/**
 * Customer emails in the shop's own name and look. Per deployment, from the environment:
 * SHOP_NAME, EMAIL_LOGO_URL (an absolute https URL), EMAIL_BRAND_COLOR (buttons),
 * EMAIL_ACCENT_COLOR (links), EMAIL_BACKGROUND_COLOR. The contact line in the footer comes from
 * the shop's settings in the dashboard (WhatsApp, email, hours) when the storefront-content
 * plugin is installed. Templates: static/email/templates.
 */
orderConfirmationHandler.setSubject('Order {{ order.code }} is confirmed – thank you');
emailVerificationHandler.setSubject('Confirm your email address');
passwordResetHandler.setSubject('Reset your password');
emailAddressChangeHandler.setSubject('Confirm your new email address');

export const emailHandlers = defaultEmailHandlers;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function emailTemplateVars(storefrontUrl: string): GlobalTemplateVarsFn {
    const fixed = {
        fromAddress: process.env.EMAIL_FROM || '"Shop" <noreply@example.com>',
        shopName: process.env.SHOP_NAME || 'Our shop',
        shopUrl: storefrontUrl,
        shopHost: new URL(storefrontUrl).host.replace(/^www\./, ''),
        logoUrl: process.env.EMAIL_LOGO_URL || '',
        brandColor: process.env.EMAIL_BRAND_COLOR || '#222222',
        accentColor: process.env.EMAIL_ACCENT_COLOR || '#7a6a55',
        backgroundColor: process.env.EMAIL_BACKGROUND_COLOR || '#f5f3ef',
        verifyEmailAddressUrl: `${storefrontUrl}/account/verify`,
        passwordResetUrl: `${storefrontUrl}/account/reset-password`,
        changeEmailAddressUrl: `${storefrontUrl}/account/verify-email`,
    };
    return async ctx => {
        const settings = (ctx.channel?.customFields ?? {}) as Record<string, unknown>;
        return {
            ...fixed,
            whatsappNumber: text(settings.whatsappNumber).replace(/\D/g, ''),
            contactEmail: text(settings.contactEmail),
            businessHours: text(settings.businessHours),
        };
    };
}
