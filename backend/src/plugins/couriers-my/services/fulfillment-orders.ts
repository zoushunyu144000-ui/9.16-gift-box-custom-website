import { Channel, ID, idsAreEqual, Order, TransactionalConnection } from '@vendure/core';

/** The orders of each fulfillment, with their channels, in one query for any number of fulfillments. */
export async function ordersByFulfillment(connection: TransactionalConnection, fulfillmentIds: ID[]): Promise<Map<string, Order[]>> {
    const result = new Map<string, Order[]>();
    if (!fulfillmentIds.length) return result;
    const orders = await connection.rawConnection
        .getRepository(Order)
        .createQueryBuilder('order')
        .innerJoinAndSelect('order.fulfillments', 'fulfillment', 'fulfillment.id IN (:...ids)', { ids: fulfillmentIds })
        .leftJoinAndSelect('order.channels', 'channel')
        .getMany();
    for (const order of orders) {
        for (const fulfillment of order.fulfillments) {
            result.set(String(fulfillment.id), [...(result.get(String(fulfillment.id)) ?? []), order]);
        }
    }
    return result;
}

/**
 * The orders' own channel. Every order is also in the default channel, so any other channel wins; booking,
 * tracking and cancelling all use this, so they always talk to the same EasyParcel account.
 */
export function ownChannel(orders: Array<Pick<Order, 'channels'>>, defaultChannel: Channel): Channel {
    for (const order of orders) {
        const own = (order.channels ?? []).find(channel => !idsAreEqual(channel.id, defaultChannel.id));
        if (own) return own;
    }
    return defaultChannel;
}
