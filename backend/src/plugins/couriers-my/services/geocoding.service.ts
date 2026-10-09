import { Inject, Injectable } from '@nestjs/common';
import { Logger, TransactionalConnection } from '@vendure/core';
import { geocodeAddress } from '../clients/google-geocoding';
import { ProviderError } from '../clients/http';
import { COURIERS_OPTIONS, loggerCtx } from '../constants';
import { sha256Hex } from '../crypto';
import { CourierGeocode } from '../entities/courier-geocode.entity';
import { ResolvedCouriersOptions } from '../options';

export interface Coordinates {
    lat: number;
    lng: number;
}

export function addressCacheKey(address: string): string {
    return sha256Hex(address.trim().toLowerCase().replace(/\s+/g, ' '));
}

/** Recipient coordinates for Lalamove stops: Google Geocoding, cached per address in the database. */
@Injectable()
export class GeocodingService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(COURIERS_OPTIONS) private options: ResolvedCouriersOptions,
    ) {}

    async geocode(address: string): Promise<Coordinates> {
        const addressHash = addressCacheKey(address);
        // Outside the request's transaction: a paid lookup is worth keeping even if the booking fails.
        const repository = this.connection.rawConnection.getRepository(CourierGeocode);
        const cached = await repository.findOne({ where: { addressHash } });
        if (cached) return { lat: Number(cached.lat), lng: Number(cached.lng) };

        if (!this.options.google.apiKey) {
            throw new ProviderError('google', 'GOOGLE_MAPS_API_KEY is not set, so the shipping address cannot be placed on the map for Lalamove.');
        }
        const result = await geocodeAddress({
            apiKey: this.options.google.apiKey,
            address,
            baseUrl: this.options.google.url,
            fetch: this.options.fetch,
        });
        if (!result) throw new ProviderError('google', `Google Maps could not find "${address}". Please check the shipping address.`);
        if (result.partialMatch || result.locationType === 'APPROXIMATE') {
            Logger.warn(`Only an approximate location was found for a shipping address (${result.locationType ?? 'partial match'}); check the driver's drop-off pin.`, loggerCtx);
        }
        try {
            await repository.save(
                new CourierGeocode({ addressHash, lat: String(result.lat), lng: String(result.lng), locationType: result.locationType ?? null }),
            );
        } catch {
            // Another request cached the same address first.
        }
        return { lat: result.lat, lng: result.lng };
    }
}
