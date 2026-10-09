import gql from 'graphql-tag';

/** Shop API, as in docs/api-contracts.md §1. HostedPaymentError adds HOSTED_PAYMENT_ERROR to ErrorCode. */
export const shopApiExtensions = gql`
    input CreateHostedPaymentInput {
        "A PaymentMethod whose handler is chip or billplz"
        paymentMethodCode: String!
        "Customer comes back here after paying; must be on an allowed storefront origin. ?order=<code> is added."
        returnUrl: String!
        "Defaults to returnUrl"
        cancelUrl: String
        "Hint, gateway may ignore: fpx | fpx_b2b | card | ewallet | duitnow_qr"
        preferredMethod: String
    }

    type HostedPaymentRedirect {
        url: String!
        "Gateway purchase / bill id"
        reference: String!
    }

    type HostedPaymentError implements ErrorResult {
        errorCode: ErrorCode!
        message: String!
    }

    union CreateHostedPaymentResult = HostedPaymentRedirect | HostedPaymentError

    type HostedPaymentStatus {
        orderCode: String!
        orderState: String!
        paid: Boolean!
    }

    extend type Mutation {
        "Active order must be in ArrangingPayment. Creates a purchase/bill for order.totalWithTax."
        createHostedPayment(input: CreateHostedPaymentInput!): CreateHostedPaymentResult!
    }

    extend type Query {
        "After the customer returns: asks the gateway and records the payment if the webhook hasn't yet. Same access rule as orderByCode."
        hostedPaymentStatus(orderCode: String!): HostedPaymentStatus!
    }
`;
