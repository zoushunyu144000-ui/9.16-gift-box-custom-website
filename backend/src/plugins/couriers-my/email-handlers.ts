import { FulfillmentStateTransitionEvent, Injector, Order, OrderService, TransactionalConnection } from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';
import { STATUS_LABELS } from './status';
import { CourierFulfillmentFields, isShipmentStatus } from './types';

/** Template variables for static/email/templates/shipment-update/body.hbs. */
export interface ShipmentEmailData {
    order: Order;
    items: Array<{ name: string; quantity: number }>;
    shipment: { method: string; trackingCode: string | null; trackingUrl: string | null; status: string | null };
}

async function loadShipmentEmailData(event: FulfillmentStateTransitionEvent, injector: Injector): Promise<ShipmentEmailData> {
    const { ctx, fulfillment } = event;
    const owner = await injector
        .get(TransactionalConnection)
        .getRepository(ctx, Order)
        .createQueryBuilder('order')
        .innerJoin('order.fulfillments', 'fulfillment', 'fulfillment.id = :id', { id: fulfillment.id })
        .getOne();
    const order = owner && (await injector.get(OrderService).findOne(ctx, owner.id));
    if (!order?.customer?.emailAddress) throw new Error(`No customer email for fulfillment ${fulfillment.id}`);
    const quantities = new Map((fulfillment.lines ?? []).map(line => [String(line.orderLineId), line.quantity]));
    const custom = (fulfillment.customFields ?? {}) as CourierFulfillmentFields;
    return {
        order,
        // Only what is in this parcel: an order can go out in several deliveries.
        items: order.lines
            .filter(line => quantities.has(String(line.id)))
            .map(line => ({ name: line.productVariant.name, quantity: quantities.get(String(line.id))! })),
        shipment: {
            method: fulfillment.method,
            trackingCode: fulfillment.trackingCode || null,
            trackingUrl: custom.trackingUrl ?? null,
            status: isShipmentStatus(custom.shipmentStatus) ? STATUS_LABELS[custom.shipmentStatus] : null,
        },
    };
}

function shipmentEmail(toState: 'Shipped' | 'Delivered', subject: string) {
    return new EmailEventListener('shipment-update')
        .on(FulfillmentStateTransitionEvent)
        .filter(event => event.toState === toState)
        .loadData(({ event, injector }) => loadShipmentEmailData(event, injector))
        .setRecipient(event => event.data.order.customer!.emailAddress)
        .setFrom('{{ fromAddress }}')
        .setSubject(subject)
        .setTemplateVars(event => ({ ...event.data, delivered: toState === 'Delivered' }));
}

/**
 * Customer emails for every fulfillment (any courier, including the manual one): when it is Shipped,
 * with the tracking link, and when it is Delivered. Registered with the EmailPlugin by
 * MalaysianCouriersPlugin (option `customerEmails`), or add them to EmailPlugin.init({ handlers }) yourself.
 */
export const shipmentShippedEmailHandler = shipmentEmail('Shipped', 'Your order {{ order.code }} is on its way');
export const shipmentDeliveredEmailHandler = shipmentEmail('Delivered', 'Your order {{ order.code }} has been delivered');
export const shipmentEmailHandlers = [shipmentShippedEmailHandler, shipmentDeliveredEmailHandler];
