export type EnquiryErrorCode = 'ENQUIRY_INPUT_ERROR' | 'ENQUIRY_ITEM_UNAVAILABLE_ERROR' | 'ENQUIRY_RATE_LIMIT_ERROR';

/**
 * The ErrorResult of submitEnquiry. Deliberately not a subclass of Vendure's ErrorResult class: Vendure
 * looks those messages up as translation keys, and ours are already the words the customer should see.
 */
export class EnquiryError {
    readonly __typename = 'EnquiryError';

    constructor(
        readonly errorCode: EnquiryErrorCode,
        readonly message: string,
    ) {}
}

export interface EnquiryReceipt {
    __typename: 'EnquiryReceipt';
    code: string;
}

export type SubmitEnquiryResult = EnquiryReceipt | EnquiryError;
