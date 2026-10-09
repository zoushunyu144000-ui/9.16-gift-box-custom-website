import { fulfillmentStateFor, STATUS_PROGRESS } from './status';
import { isFinalShipmentStatus, isShipmentStatus, ShipmentStatus } from './types';

/** What we hold for a shipment: the Vendure fulfillment and its courier custom fields. */
export interface ShipmentSnapshot {
    fulfillmentState: string;
    status: string | null | undefined;
    lastEventAt: Date | null | undefined;
    providerOrderId: string | null | undefined;
    trackingCode: string | null | undefined;
    trackingUrl: string | null | undefined;
    labelUrl: string | null | undefined;
}

/** What the provider reports now (always re-fetched from its API, never taken from a webhook body). */
export interface ShipmentObservation {
    /** Undefined when the provider status could not be mapped: the current status is kept. */
    status?: ShipmentStatus;
    /** The provider's own wording, kept in the event log. */
    providerStatus?: string;
    /** When the provider says the latest event happened. */
    eventAt?: Date;
    /** Set when the provider moved the shipment to a new id (Lalamove ORDER_REPLACED). */
    providerOrderId?: string;
    trackingCode?: string | null;
    trackingUrl?: string | null;
    labelUrl?: string | null;
    /**
     * The source's statuses only move forward (EasyParcel: its "latest" status can lag behind its own log).
     * Lalamove's can step back (a driver rejection returns PICKED_UP to ASSIGNING_DRIVER).
     */
    forwardOnly?: boolean;
}

export interface ShipmentChanges {
    status?: ShipmentStatus;
    lastEventAt?: Date;
    providerOrderId?: string;
    trackingCode?: string;
    trackingUrl?: string;
    labelUrl?: string;
}

export interface ShipmentPlan {
    changes: ShipmentChanges;
    statusChanged: boolean;
    /** The fulfillment state to move to, if the provider status calls for one we have not reached. */
    transitionTo: 'Shipped' | 'Delivered' | null;
}

/**
 * Webhooks can arrive out of order and be retried. An event older than the last one applied is stale:
 * re-fetching would only repeat newer information, and on Lalamove it could replay a status a driver
 * rejection has since undone. Events without a time are never stale.
 */
export function isStaleEvent(snapshot: Pick<ShipmentSnapshot, 'lastEventAt'>, eventAt: Date | undefined): boolean {
    if (!eventAt || !snapshot.lastEventAt) return false;
    return eventAt.getTime() < new Date(snapshot.lastEventAt).getTime();
}

/**
 * Works out what to change for an observation. Applying the same observation twice plans no changes,
 * so redelivered webhooks and overlapping reconcile runs are harmless. A reading taken before a newer
 * one was applied can't undo it: delivered, failed and cancelled stay put (unless the provider moved the
 * shipment to a new order id), and forward-only sources never step back.
 */
export function planShipmentUpdate(snapshot: ShipmentSnapshot, observation: ShipmentObservation): ShipmentPlan {
    const changes: ShipmentChanges = {};
    const currentStatus = isShipmentStatus(snapshot.status) ? snapshot.status : undefined;
    const newOrderId = !!observation.providerOrderId && observation.providerOrderId !== snapshot.providerOrderId;
    const proposed = observation.status;
    if (proposed && proposed !== currentStatus) {
        const finished = !!currentStatus && isFinalShipmentStatus(currentStatus) && !newOrderId;
        const backwards = !!currentStatus && !!observation.forwardOnly && STATUS_PROGRESS[proposed] < STATUS_PROGRESS[currentStatus];
        if (!finished && !backwards) changes.status = proposed;
    }

    if (newOrderId) changes.providerOrderId = observation.providerOrderId;
    const setIfNew = (key: 'trackingCode' | 'trackingUrl' | 'labelUrl', value: string | null | undefined) => {
        // Providers sometimes omit links they sent before (e.g. AWB details without a label), so a blank
        // value never clears a stored one.
        if (value && value !== snapshot[key]) changes[key] = value;
    };
    setIfNew('trackingCode', observation.trackingCode);
    setIfNew('trackingUrl', observation.trackingUrl);
    setIfNew('labelUrl', observation.labelUrl);

    if (observation.eventAt && !Number.isNaN(observation.eventAt.getTime())) {
        const last = snapshot.lastEventAt ? new Date(snapshot.lastEventAt).getTime() : -Infinity;
        if (observation.eventAt.getTime() > last) changes.lastEventAt = observation.eventAt;
    }

    // Based on the resulting status, so a transition that failed earlier is retried by the next update.
    const target = fulfillmentStateFor(changes.status ?? currentStatus);
    let transitionTo: ShipmentPlan['transitionTo'] = null;
    if (target === 'Delivered' && (snapshot.fulfillmentState === 'Pending' || snapshot.fulfillmentState === 'Shipped')) {
        transitionTo = 'Delivered';
    } else if (target === 'Shipped' && snapshot.fulfillmentState === 'Pending') {
        transitionTo = 'Shipped';
    }
    return { changes, statusChanged: changes.status !== undefined, transitionTo };
}

export function hasChanges(plan: ShipmentPlan): boolean {
    return Object.keys(plan.changes).length > 0;
}
