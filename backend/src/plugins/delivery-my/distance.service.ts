import { Inject, Injectable } from '@nestjs/common';
import { Logger, TransactionalConnection } from '@vendure/core';
import { DELIVERY_MY_OPTIONS, loggerCtx } from './constants';
import { DeliveryDistance } from './delivery-distance.entity';
import { DistanceOutcome, DistanceStore, RoadDistanceLookup } from './distance';
import { MalaysianDeliveryOptions } from './types';

@Injectable()
export class DistanceService {
    private lookup: RoadDistanceLookup;

    constructor(connection: TransactionalConnection, @Inject(DELIVERY_MY_OPTIONS) options: MalaysianDeliveryOptions) {
        // The cache is read and written outside the request's transaction: a failed write (two checkouts saving
        // the same postcode at once) must never abort the customer's order.
        const repository = () => connection.rawConnection.getRepository(DeliveryDistance);
        const store: DistanceStore = {
            find: async (postcode, origin) => (await repository().findOne({ where: { postcode, origin } })) ?? undefined,
            save: async entry => {
                await repository().upsert(new DeliveryDistance(entry), { conflictPaths: ['postcode', 'origin'] });
            },
        };
        this.lookup = new RoadDistanceLookup(store, {
            origin: options.origin,
            apiKey: () => options.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || undefined,
            timeoutMs: options.timeoutMs,
            cacheDays: options.distanceCacheDays,
            log: message => Logger.warn(message, loggerCtx),
        });
    }

    distanceKm(postcode: string, destination: string): Promise<DistanceOutcome> {
        return this.lookup.distanceKm(postcode, destination);
    }
}
