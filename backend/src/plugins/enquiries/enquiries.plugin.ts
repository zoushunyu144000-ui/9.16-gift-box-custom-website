import { OnApplicationBootstrap } from '@nestjs/common';
import { Logger, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { EmailPlugin, EmailPluginOptions } from '@vendure/email-plugin';
import {
    adminApiExtensions,
    EnquiryAdminResolver,
    EnquiryEntityResolver,
    EnquiryShopResolver,
    shopApiExtensions,
    SubmitEnquiryResultResolver,
} from './api';
import { ENQUIRIES_PLUGIN_OPTIONS, EnquiriesOptions, loggerCtx, readEnquiryPermission, updateEnquiryPermission } from './constants';
import { enquiryEmailHandler } from './email';
import { Enquiry } from './enquiry.entity';
import { EnquiryService } from './enquiry.service';

/**
 * Adds the "new enquiry" email to the EmailPlugin's handlers, so registering this plugin is all a shop
 * needs to do. The EmailPlugin keeps its options in a private static field (set by EmailPlugin.init) and
 * only subscribes its handlers when the app starts, after every plugin's configuration step.
 */
function addEmailHandler(options: EnquiriesOptions) {
    const emailOptions = (EmailPlugin as unknown as { options?: EmailPluginOptions }).options;
    if (!emailOptions?.handlers) {
        Logger.warn('The EmailPlugin is not set up, so new enquiries will not be emailed to the shop.', loggerCtx);
        return;
    }
    const handler = enquiryEmailHandler(options);
    if (emailOptions.handlers.some(h => h.type === handler.type)) return;
    emailOptions.handlers = [...emailOptions.handlers, handler];
}

/**
 * Quote requests from the storefront (e.g. corporate gifts), managed by staff in the dashboard.
 *
 * - Shop API `submitEnquiry` (API contract §5): checks the form, prices the chosen gifts, saves the enquiry
 *   with a short reference (ENQ-7G4K2) and answers with that reference or an EnquiryError.
 *   Against spam: a limit per IP address and a hidden `website` field in `details` that only bots fill in.
 * - Each new enquiry publishes EnquirySubmittedEvent and is emailed to the shop (notifyEmail /
 *   SHOP_NOTIFY_EMAIL) with Reply-To set to the customer.
 * - Admin API and dashboard (Sales → Enquiries): list, filter, status and internal notes, behind the
 *   ReadEnquiry / UpdateEnquiry permissions.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    entities: [Enquiry],
    providers: [EnquiryService, { provide: ENQUIRIES_PLUGIN_OPTIONS, useFactory: () => EnquiriesPlugin.options }],
    shopApiExtensions: { schema: shopApiExtensions, resolvers: [EnquiryShopResolver, SubmitEnquiryResultResolver] },
    adminApiExtensions: { schema: adminApiExtensions, resolvers: [EnquiryAdminResolver, EnquiryEntityResolver] },
    dashboard: './dashboard/index.tsx',
    configuration: config => {
        config.authOptions.customPermissions.push(readEnquiryPermission, updateEnquiryPermission);
        addEmailHandler(EnquiriesPlugin.options);
        return config;
    },
})
export class EnquiriesPlugin implements OnApplicationBootstrap {
    static options: EnquiriesOptions = { codePrefix: 'ENQ', rateLimit: { limit: 5, windowMinutes: 60 } };

    static init(options: Partial<EnquiriesOptions> = {}) {
        const merged = { ...this.options, ...options };
        if (!/^[A-Z0-9]{1,8}$/.test(merged.codePrefix)) {
            throw new Error(`EnquiriesPlugin: codePrefix must be 1–8 capital letters or digits, e.g. "ENQ" (got "${merged.codePrefix}")`);
        }
        this.options = merged;
        return EnquiriesPlugin;
    }

    onApplicationBootstrap() {
        if (!EnquiriesPlugin.options.notifyEmail && !process.env.SHOP_NOTIFY_EMAIL) {
            Logger.warn('No notifyEmail or SHOP_NOTIFY_EMAIL set: new enquiries appear in the dashboard but are not emailed.', loggerCtx);
        }
    }
}
