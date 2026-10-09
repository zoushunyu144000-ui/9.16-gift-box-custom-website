import { FetchFn, httpRequest, ProviderError } from './http';

export const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

export interface GeocodeResult {
    lat: number;
    lng: number;
    /** ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE */
    locationType?: string;
    partialMatch: boolean;
}

interface GeocodeResponse {
    status: string;
    error_message?: string;
    results?: Array<{
        geometry?: { location?: { lat: number; lng: number }; location_type?: string };
        partial_match?: boolean;
    }>;
}

/**
 * Google Geocoding API, restricted to the given country. Returns undefined when Google finds nothing
 * (ZERO_RESULTS); throws for key, quota and server problems so staff see why booking failed.
 */
export async function geocodeAddress(input: {
    apiKey: string;
    address: string;
    country?: string;
    baseUrl?: string;
    fetch?: FetchFn;
    timeoutMs?: number;
}): Promise<GeocodeResult | undefined> {
    const country = input.country ?? 'MY';
    const url = new URL(input.baseUrl ?? GOOGLE_GEOCODING_URL);
    url.searchParams.set('address', input.address);
    url.searchParams.set('components', `country:${country}`);
    url.searchParams.set('region', country.toLowerCase());
    url.searchParams.set('key', input.apiKey);
    const response = await httpRequest<GeocodeResponse>(input.fetch ?? fetch, url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeoutMs: input.timeoutMs ?? 10_000,
    });
    const body = response.json;
    if (!response.ok || !body) throw new ProviderError('google', `Google Geocoding failed (HTTP ${response.status}).`, response.status);
    if (body.status === 'ZERO_RESULTS') return undefined;
    if (body.status !== 'OK') {
        // error_message never contains the key; the status names the problem (REQUEST_DENIED, OVER_QUERY_LIMIT…).
        throw new ProviderError('google', `Google Geocoding: ${body.status}${body.error_message ? ` (${body.error_message})` : ''}`, response.status, body.status);
    }
    const first = body.results?.[0];
    const location = first?.geometry?.location;
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return undefined;
    return { lat: location.lat, lng: location.lng, locationType: first?.geometry?.location_type, partialMatch: !!first?.partial_match };
}
