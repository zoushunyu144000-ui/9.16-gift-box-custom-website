import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasChanges, isStaleEvent, planShipmentUpdate, ShipmentSnapshot } from './shipment-plan';

const booked = (overrides: Partial<ShipmentSnapshot> = {}): ShipmentSnapshot => ({
    fulfillmentState: 'Pending',
    status: 'booked',
    lastEventAt: new Date('2026-10-09T03:00:00Z'),
    providerOrderId: '3463513590991397204',
    trackingCode: '3463513590991397204',
    trackingUrl: 'https://share.lalamove.com/old',
    labelUrl: null,
    ...overrides,
});

describe('planning a shipment update', () => {
    it('ships the fulfillment when the courier picks the parcel up', () => {
        const plan = planShipmentUpdate(booked(), { status: 'out_for_delivery', eventAt: new Date('2026-10-09T03:10:00Z') });
        assert.equal(plan.transitionTo, 'Shipped');
        assert.equal(plan.changes.status, 'out_for_delivery');
        assert.equal(plan.changes.lastEventAt?.toISOString(), '2026-10-09T03:10:00.000Z');
    });

    it('delivers straight from Pending or from Shipped', () => {
        assert.equal(planShipmentUpdate(booked(), { status: 'delivered' }).transitionTo, 'Delivered');
        assert.equal(planShipmentUpdate(booked({ fulfillmentState: 'Shipped', status: 'in_transit' }), { status: 'delivered' }).transitionTo, 'Delivered');
    });

    it('never moves a delivered or cancelled fulfillment', () => {
        assert.equal(planShipmentUpdate(booked({ fulfillmentState: 'Delivered', status: 'delivered' }), { status: 'delivered' }).transitionTo, null);
        assert.equal(planShipmentUpdate(booked({ fulfillmentState: 'Cancelled' }), { status: 'delivered' }).transitionTo, null);
        assert.equal(planShipmentUpdate(booked({ fulfillmentState: 'Shipped', status: 'in_transit' }), { status: 'out_for_delivery' }).transitionTo, null);
    });

    it('only records failed and cancelled shipments', () => {
        for (const status of ['failed', 'cancelled'] as const) {
            const plan = planShipmentUpdate(booked(), { status });
            assert.equal(plan.transitionTo, null);
            assert.equal(plan.changes.status, status);
        }
    });

    it('is idempotent: the same observation twice changes nothing the second time', () => {
        const observation = { status: 'delivered' as const, trackingUrl: 'https://share.lalamove.com/new', eventAt: new Date('2026-10-09T04:00:00Z') };
        const first = planShipmentUpdate(booked(), observation);
        assert.ok(hasChanges(first));
        const after = booked({
            fulfillmentState: 'Delivered',
            status: first.changes.status,
            trackingUrl: first.changes.trackingUrl,
            lastEventAt: first.changes.lastEventAt,
        });
        const second = planShipmentUpdate(after, observation);
        assert.ok(!hasChanges(second));
        assert.equal(second.transitionTo, null);
        assert.equal(second.statusChanged, false);
    });

    it('retries a transition that did not happen even when the status is unchanged', () => {
        // e.g. the status was saved but the fulfillment transition failed the first time
        const plan = planShipmentUpdate(booked({ status: 'delivered' }), { status: 'delivered' });
        assert.ok(!plan.statusChanged);
        assert.equal(plan.transitionTo, 'Delivered');
    });

    it('keeps links the provider leaves out and never moves lastEventAt backwards', () => {
        const plan = planShipmentUpdate(booked({ labelUrl: 'https://label/A6' }), {
            status: 'booked',
            labelUrl: null,
            trackingUrl: '',
            eventAt: new Date('2026-10-09T02:00:00Z'),
        });
        assert.ok(!hasChanges(plan));
    });

    it('follows a replaced Lalamove order to its new id', () => {
        const plan = planShipmentUpdate(booked({ status: 'cancelled' }), {
            status: 'booked',
            providerOrderId: '3463513590991397328',
            trackingCode: '3463513590991397328',
        });
        assert.equal(plan.changes.providerOrderId, '3463513590991397328');
        assert.equal(plan.changes.trackingCode, '3463513590991397328');
        assert.equal(plan.changes.status, 'booked');
    });

    it('keeps delivered, failed and cancelled once reached (a late reading cannot reopen them)', () => {
        assert.equal(planShipmentUpdate(booked({ fulfillmentState: 'Delivered', status: 'delivered' }), { status: 'in_transit' }).changes.status, undefined);
        assert.equal(planShipmentUpdate(booked({ status: 'failed' }), { status: 'out_for_delivery' }).changes.status, undefined);
        assert.equal(planShipmentUpdate(booked({ status: 'failed' }), { status: 'out_for_delivery' }).transitionTo, null);
        assert.equal(planShipmentUpdate(booked({ status: 'cancelled' }), { status: 'booked' }).changes.status, undefined);
        // Final is final, also between final statuses: the fulfillment can't leave Delivered either.
        assert.equal(planShipmentUpdate(booked({ status: 'delivered' }), { status: 'failed' }).changes.status, undefined);
    });

    it('never steps a forward-only source back (EasyParcel), but follows Lalamove driver rejections', () => {
        const inTransit = booked({ fulfillmentState: 'Shipped', status: 'in_transit' });
        assert.equal(planShipmentUpdate(inTransit, { status: 'picked_up', forwardOnly: true }).changes.status, undefined);
        assert.equal(planShipmentUpdate(inTransit, { status: 'booked', forwardOnly: true }).changes.status, undefined);
        assert.equal(planShipmentUpdate(inTransit, { status: 'out_for_delivery', forwardOnly: true }).changes.status, 'out_for_delivery');
        assert.equal(planShipmentUpdate(inTransit, { status: 'cancelled', forwardOnly: true }).changes.status, 'cancelled');
        // Lalamove: a driver rejection reverts PICKED_UP to ASSIGNING_DRIVER; the fulfillment stays Shipped.
        const pickedUp = booked({ fulfillmentState: 'Shipped', status: 'out_for_delivery' });
        const rejected = planShipmentUpdate(pickedUp, { status: 'booked' });
        assert.equal(rejected.changes.status, 'booked');
        assert.equal(rejected.transitionTo, null);
    });

    it('lets a replaced Lalamove order reopen a cancelled shipment, and only with a new id', () => {
        const replaced = planShipmentUpdate(booked({ status: 'cancelled' }), { status: 'booked', providerOrderId: '3463513590991397328' });
        assert.equal(replaced.changes.status, 'booked');
        const sameId = planShipmentUpdate(booked({ status: 'cancelled' }), { status: 'booked', providerOrderId: '3463513590991397204' });
        assert.equal(sameId.changes.status, undefined);
    });

    it('keeps the current status when the provider status is unknown', () => {
        const plan = planShipmentUpdate(booked({ status: 'in_transit', fulfillmentState: 'Shipped' }), { providerStatus: 'Weird' });
        assert.ok(!plan.statusChanged);
        assert.equal(plan.transitionTo, null);
    });
});

describe('out-of-order webhooks', () => {
    it('treats events older than the last applied one as stale', () => {
        const snapshot = booked({ lastEventAt: new Date('2026-04-01T15:17:00Z') });
        assert.ok(isStaleEvent(snapshot, new Date('2026-04-01T15:13:00Z')));
        assert.ok(!isStaleEvent(snapshot, new Date('2026-04-01T15:17:00Z')));
        assert.ok(!isStaleEvent(snapshot, new Date('2026-04-01T15:20:00Z')));
        assert.ok(!isStaleEvent(snapshot, undefined));
        assert.ok(!isStaleEvent(booked({ lastEventAt: null }), new Date()));
    });
});
