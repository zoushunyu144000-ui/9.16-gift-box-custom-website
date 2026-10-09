import gql from 'graphql-tag';

// Shared by both APIs (each is its own schema).
const commonTypes = gql`
    "How points work in this shop."
    type LoyaltySettings {
        "Points for each whole ringgit spent on products (after discounts, delivery not counted)."
        pointsPerRinggit: Int!
        "What one point is worth when used, in sen (1 = 100 points for RM 1)."
        pointValueSen: Int!
        "The fewest points that can be used on one order."
        minRedeemPoints: Int!
        "The largest share of the products subtotal points can pay for, in percent."
        maxRedeemPercent: Int!
    }

    input LoyaltyHistoryOptions {
        skip: Int
        "Default 20, at most 100."
        take: Int
    }
`;

/** api-contracts §4, exactly. */
export const shopApiExtensions = gql`
    ${commonTypes}

    type LoyaltyPointsEntry {
        id: ID!
        createdAt: DateTime!
        "Positive when points were added, negative when they were taken."
        points: Int!
        "earned | redeemed | adjusted | reversed"
        reason: String!
        note: String
        orderCode: String
    }

    type LoyaltyPointsEntryList {
        items: [LoyaltyPointsEntry!]!
        totalItems: Int!
    }

    extend enum ErrorCode {
        LOYALTY_POINTS_ERROR
    }

    type LoyaltyPointsError implements ErrorResult {
        errorCode: ErrorCode!
        message: String!
    }

    union ApplyLoyaltyPointsResult = Order | LoyaltyPointsError

    extend type Query {
        loyaltySettings: LoyaltySettings!
        "The signed-in customer's points history, newest first."
        loyaltyHistory(options: LoyaltyHistoryOptions): LoyaltyPointsEntryList!
    }

    extend type Mutation {
        "Uses points on the active order (0 removes them); the discount appears on the order."
        applyLoyaltyPoints(points: Int!): ApplyLoyaltyPointsResult!
    }
`;

export const adminApiExtensions = gql`
    ${commonTypes}

    type LoyaltyPointsEntry {
        id: ID!
        createdAt: DateTime!
        points: Int!
        "earned | redeemed | adjusted | reversed"
        reason: String!
        note: String
        orderId: ID
        orderCode: String
        "Who made a staff adjustment."
        administratorName: String
    }

    type LoyaltyPointsEntryList {
        items: [LoyaltyPointsEntry!]!
        totalItems: Int!
    }

    extend type Query {
        loyaltySettings: LoyaltySettings!
        "A customer's points history, newest first."
        customerLoyaltyHistory(customerId: ID!, options: LoyaltyHistoryOptions): LoyaltyPointsEntryList!
    }

    extend type Mutation {
        "Adds (positive) or takes away (negative) points, with a note saying why. The balance can't go below 0."
        adjustLoyaltyPoints(customerId: ID!, points: Int!, note: String!): Customer!
    }
`;
