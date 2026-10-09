import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/** Road distance from the shop to a postcode, from Google's Routes API, reused for 30 days (see distance.ts). */
@Entity()
@Index(['postcode', 'origin'], { unique: true })
export class DeliveryDistance extends VendureEntity {
    constructor(input?: DeepPartial<DeliveryDistance>) {
        super(input);
    }

    @Column({ length: 5 })
    postcode: string;

    /** "lat,lng" of the shop the distance was measured from: a new pickup point gets fresh distances. */
    @Column({ length: 40 })
    origin: string;

    /** The address Google was asked to route to. */
    @Column()
    destination: string;

    @Column('int')
    distanceMeters: number;

    @Column()
    fetchedAt: Date;
}
