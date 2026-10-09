import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import gql from 'graphql-tag';
import { DeliveryQuoteInput, DeliveryService } from './delivery.service';

/** Shop API, exactly as docs/api-contracts.md §2. */
export const shopApiExtensions = gql`
    type DeliveryPromise {
        "klang-valley | peninsular | sabah-labuan | sarawak | unknown"
        zone: String!
        "e.g. KL & Selangor"
        zoneLabel: String!
        "klang-valley and before the cut-off on a dispatch day"
        sameDayAvailable: Boolean!
        "YYYY-MM-DD: today before the cut-off on a dispatch day, else the next dispatch day (skips Sundays and closed dates)"
        earliestDispatchDate: String!
        "HH:MM in Malaysian time, e.g. 15:00"
        cutoffTime: String!
        "Every YYYY-MM-DD in the next 90 days without dispatch (Sundays and closed dates), for date pickers"
        closedDates: [String!]!
        "One sentence for the customer, e.g. Order before 3pm for same-day delivery."
        message: String!
    }

    input DeliveryQuoteInput {
        postalCode: String!
        province: String
        lines: [DeliveryQuoteLineInput!]!
    }

    input DeliveryQuoteLineInput {
        productVariantId: ID!
        quantity: Int!
    }

    type DeliveryQuoteOption {
        id: ID!
        code: String!
        name: String!
        description: String!
        priceWithTax: Money!
    }

    extend type Query {
        deliveryPromise(postalCode: String!): DeliveryPromise!
        "Prices for a basket before an order exists, using the same checkers and calculators as checkout."
        deliveryQuote(input: DeliveryQuoteInput!): [DeliveryQuoteOption!]!
    }
`;

@Resolver()
export class DeliveryShopResolver {
    constructor(private deliveryService: DeliveryService) {}

    @Query()
    @Allow(Permission.Public)
    deliveryPromise(@Ctx() ctx: RequestContext, @Args() args: { postalCode: string }) {
        return this.deliveryService.promise(ctx, { postalCode: args.postalCode });
    }

    @Query()
    @Allow(Permission.Public)
    deliveryQuote(@Ctx() ctx: RequestContext, @Args() args: { input: DeliveryQuoteInput }) {
        return this.deliveryService.quote(ctx, args.input);
    }
}
