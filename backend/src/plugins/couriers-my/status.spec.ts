import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { easyParcelStatus, fulfillmentStateFor, lalamoveStatus } from './status';
import { isFinalShipmentStatus } from './types';

describe('Lalamove status mapping', () => {
    it('maps every documented order status', () => {
        assert.equal(lalamoveStatus('ASSIGNING_DRIVER'), 'booked');
        assert.equal(lalamoveStatus('ON_GOING'), 'booked');
        assert.equal(lalamoveStatus('PICKED_UP'), 'out_for_delivery');
        assert.equal(lalamoveStatus('COMPLETED'), 'delivered');
        assert.equal(lalamoveStatus('CANCELED'), 'cancelled');
        assert.equal(lalamoveStatus('REJECTED'), 'failed');
        assert.equal(lalamoveStatus('EXPIRED'), 'failed');
    });

    it('ignores unknown statuses instead of guessing', () => {
        assert.equal(lalamoveStatus('SOMETHING_NEW'), undefined);
        assert.equal(lalamoveStatus(undefined), undefined);
    });

    it('treats a completed order whose drop-off failed proof of delivery as failed', () => {
        assert.equal(lalamoveStatus('COMPLETED', 'FAILED'), 'failed');
        assert.equal(lalamoveStatus('COMPLETED', 'SIGNED'), 'delivered');
    });
});

describe('EasyParcel status mapping', () => {
    it('maps the documented shipment status codes', () => {
        assert.equal(easyParcelStatus(7, 'Schedule In Arrangement'), 'booked');
        assert.equal(easyParcelStatus(2, 'To Be Collected'), 'booked');
        assert.equal(easyParcelStatus(11, 'Drop Off'), 'booked');
        assert.equal(easyParcelStatus(3, 'Parcel has been collected at Penang'), 'picked_up');
        assert.equal(easyParcelStatus(4, 'Delivery In Transit'), 'in_transit');
        assert.equal(easyParcelStatus(5, 'Deliverd To Suntech'), 'delivered');
        assert.equal(easyParcelStatus(6, 'Returned'), 'failed');
        assert.equal(easyParcelStatus(0, 'Cancel'), 'cancelled');
        assert.equal(easyParcelStatus('4'), 'in_transit');
    });

    it('lets the wording refine or override the code', () => {
        // EasyParcel's own sample reports a cancellation as code 8.
        assert.equal(easyParcelStatus(8, 'Cancelled'), 'cancelled');
        assert.equal(easyParcelStatus(8, 'On Hold - address incomplete'), 'in_transit');
        assert.equal(easyParcelStatus(4, 'Out for delivery'), 'out_for_delivery');
    });

    it('falls back to the wording for unknown codes', () => {
        assert.equal(easyParcelStatus(99, 'Parcel delivered to recipient'), 'delivered');
        assert.equal(easyParcelStatus(99, 'Parcel not delivered'), undefined);
        assert.equal(easyParcelStatus(null, 'Arrived at hub'), 'in_transit');
        assert.equal(easyParcelStatus(null, ''), undefined);
    });
});

describe('fulfillment state for a shipment status', () => {
    it('ships once the courier has the parcel and delivers on delivery', () => {
        assert.equal(fulfillmentStateFor('booked'), undefined);
        assert.equal(fulfillmentStateFor('picked_up'), 'Shipped');
        assert.equal(fulfillmentStateFor('in_transit'), 'Shipped');
        assert.equal(fulfillmentStateFor('out_for_delivery'), 'Shipped');
        assert.equal(fulfillmentStateFor('delivered'), 'Delivered');
        assert.equal(fulfillmentStateFor('failed'), undefined);
        assert.equal(fulfillmentStateFor('cancelled'), undefined);
    });

    it('knows the final statuses', () => {
        assert.ok(isFinalShipmentStatus('delivered'));
        assert.ok(isFinalShipmentStatus('cancelled'));
        assert.ok(isFinalShipmentStatus('failed'));
        assert.ok(!isFinalShipmentStatus('out_for_delivery'));
        assert.ok(!isFinalShipmentStatus(null));
    });
});
