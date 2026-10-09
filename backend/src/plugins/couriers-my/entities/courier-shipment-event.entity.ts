import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/**
 * What happened to a shipment, one row per booking, provider event or status change. The unique
 * `eventKey` (the provider's event id, or a hash of the webhook) is what makes webhook processing
 * idempotent: an event already recorded is not processed again.
 */
@Entity()
export class CourierShipmentEvent extends VendureEntity {
    constructor(input?: DeepPartial<CourierShipmentEvent>) {
        super(input);
    }

    @Index()
    @Column()
    fulfillmentId: string;

    @Column({ type: 'varchar', length: 20 })
    provider: string;

    @Column({ type: 'varchar', nullable: true })
    providerOrderId: string | null;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 200 })
    eventKey: string;

    /** booking | webhook | reconcile | refresh | staff */
    @Column({ type: 'varchar', length: 20 })
    source: string;

    /** Normalised status after the event; null when the event changed nothing (stale, duplicate data). */
    @Column({ type: 'varchar', length: 30, nullable: true })
    status: string | null;

    /** The provider's own wording, e.g. "PICKED_UP" or "Parcel has been collected at Penang". */
    @Column({ type: 'varchar', length: 255, nullable: true })
    providerStatus: string | null;

    @Column({ type: Date, nullable: true, precision: 3 })
    occurredAt: Date | null;
}
