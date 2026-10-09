import { RequestContext, VendureEvent } from '@vendure/core';
import { Enquiry } from './enquiry.entity';

/**
 * Published when a customer's enquiry has been saved (after the transaction commits). The plugin emails
 * the shop with it; other plugins can subscribe too, e.g. to post it to a chat channel.
 */
export class EnquirySubmittedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public enquiry: Enquiry,
    ) {
        super();
    }
}
