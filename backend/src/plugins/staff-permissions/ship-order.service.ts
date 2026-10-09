import { Injectable } from '@nestjs/common';
import { EntityNotFoundError, ID, isGraphQlErrorResult, OrderService, RequestContext, UserInputError } from '@vendure/core';
import { LineQuantity, orderCanShip, shipmentProblem, unshippedLines } from './shipping';

export interface ShipOrderInput {
    orderId: ID;
    lines?: LineQuantity[] | null;
    /** A FulfillmentHandler and its arguments, as in addFulfillmentToOrder. */
    handler: { code: string; arguments: Array<{ name: string; value: string }> };
}

/**
 * The same steps as the dashboard's "Fulfill order" then "Mark as shipped", through OrderService, so
 * fulfilment handlers, stock movements, order states, history and events all behave as usual.
 */
@Injectable()
export class ShipOrderService {
    constructor(private orderService: OrderService) {}

    async ship(ctx: RequestContext, input: ShipOrderInput) {
        // findOne only finds orders in the active channel.
        const order = await this.orderService.findOne(ctx, input.orderId, ['lines', 'fulfillments', 'fulfillments.lines']);
        if (!order) throw new EntityNotFoundError('Order', input.orderId);
        if (!orderCanShip(order.state, this.orderService.getNextOrderStates(order))) {
            throw new UserInputError(`Order ${order.code} can’t be shipped while it is in the ${order.state} state.`);
        }
        // createFulfillment checks quantities and stock, but not that the lines belong to this order.
        const problem = shipmentProblem(input.lines ?? [], order.lines);
        if (problem) throw new UserInputError(problem);
        const lines = input.lines?.length
            ? input.lines.filter(l => l.quantity > 0)
            : unshippedLines(order.lines, order.fulfillments ?? []);

        const fulfillment = await this.orderService.createFulfillment(ctx, { lines, handler: input.handler });
        if (isGraphQlErrorResult(fulfillment)) return fulfillment;
        // If a handler refuses "Shipped" (e.g. a courier not booked yet) the fulfilment stays Pending and the
        // error is returned: it can still be marked delivered, and the booking it holds is not lost.
        return this.orderService.transitionFulfillmentToState(ctx, fulfillment.id, 'Shipped');
    }

    markDelivered(ctx: RequestContext, fulfillmentId: ID) {
        // The fulfilment's order must be in the active channel (checked by FulfillmentService).
        return this.orderService.transitionFulfillmentToState(ctx, fulfillmentId, 'Delivered');
    }
}
