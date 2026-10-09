import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';
import gql from 'graphql-tag';
import { shipOrderPermission } from './permissions';
import { ShipOrderInput, ShipOrderService } from './ship-order.service';

export const adminApiExtensions = gql`
    input ShipOrderInput {
        orderId: ID!
        "Leave out to ship everything on the order not shipped yet."
        lines: [OrderLineInput!]
        "A fulfilment handler (see the fulfillmentHandlers query) and its arguments, e.g. courier and tracking number."
        handler: ConfigurableOperationInput!
    }

    extend type Mutation {
        "Creates the fulfilment and marks it shipped. Needs ShipOrder (not UpdateOrder)."
        shipOrder(input: ShipOrderInput!): AddFulfillmentToOrderResult!
        "Marks a fulfilment delivered. Needs ShipOrder (not UpdateOrder)."
        markFulfillmentDelivered(fulfillmentId: ID!): TransitionFulfillmentToStateResult!
    }
`;

@Resolver()
export class ShipOrderResolver {
    constructor(private shipOrderService: ShipOrderService) {}

    @Transaction()
    @Mutation()
    @Allow(shipOrderPermission.Permission)
    shipOrder(@Ctx() ctx: RequestContext, @Args() args: { input: ShipOrderInput }) {
        return this.shipOrderService.ship(ctx, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(shipOrderPermission.Permission)
    markFulfillmentDelivered(@Ctx() ctx: RequestContext, @Args() args: { fulfillmentId: ID }) {
        return this.shipOrderService.markDelivered(ctx, args.fulfillmentId);
    }
}
