/** Shipping rules, free of Vendure so they can be tested on their own. */

type Id = string | number;

export interface LineQuantity {
    orderLineId: Id;
    quantity: number;
}

const sameId = (a: Id, b: Id) => String(a) === String(b);

/** What is left to ship on each line: its quantity minus what live (not cancelled) fulfilments already hold. */
export function unshippedLines(
    lines: Array<{ id: Id; quantity: number }>,
    fulfillments: Array<{ state: string; lines?: LineQuantity[] | null }>,
): LineQuantity[] {
    const live = fulfillments.filter(f => f.state !== 'Cancelled').flatMap(f => f.lines ?? []);
    return lines
        .map(line => ({
            orderLineId: line.id,
            quantity: line.quantity - live.filter(l => sameId(l.orderLineId, line.id)).reduce((sum, l) => sum + l.quantity, 0),
        }))
        .filter(l => l.quantity > 0);
}

/**
 * The dashboard's own rule for offering "Fulfill order": the order can move on to a shipped or delivered
 * state, and is not being modified or waiting for an extra payment.
 */
export function orderCanShip(state: string, nextStates: readonly string[]): boolean {
    if (state === 'Modifying' || state === 'ArrangingAdditionalPayment') return false;
    return nextStates.some(s => s === 'Shipped' || s === 'PartiallyShipped' || s === 'Delivered');
}

/** Why these lines can't go in a shipment of this order, for staff; undefined when they can. */
export function shipmentProblem(requested: LineQuantity[], orderLines: Array<{ id: Id }>): string | undefined {
    for (const line of requested) {
        if (!orderLines.some(l => sameId(l.id, line.orderLineId))) return `Order line ${line.orderLineId} is not on this order.`;
        if (!Number.isInteger(line.quantity) || line.quantity < 0) return 'Quantities to ship must be whole numbers of 0 or more.';
    }
    return undefined;
}
