import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/**
 * Coordinates per recipient address, so a repeat customer or a re-booking doesn't pay for another
 * Google lookup. Keyed by a hash of the normalised address; the address itself isn't stored again.
 * Coordinates are strings, as Lalamove takes them, so no precision is lost on any database.
 */
@Entity()
export class CourierGeocode extends VendureEntity {
    constructor(input?: DeepPartial<CourierGeocode>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 64 })
    addressHash: string;

    @Column({ type: 'varchar', length: 32 })
    lat: string;

    @Column({ type: 'varchar', length: 32 })
    lng: string;

    /** Google's precision: ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER or APPROXIMATE. */
    @Column({ type: 'varchar', length: 32, nullable: true })
    locationType: string | null;
}
