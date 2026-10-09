import { Inject, Injectable } from '@nestjs/common';
import { Injector, Logger, RequestContext } from '@vendure/core';
import { matchesCollection, QuotationShipment, round2, toSen } from './clients/easyparcel';
import { COURIERS_OPTIONS, loggerCtx } from './constants';
import { ResolvedCouriersOptions } from './options';
import { couriersInjector, setCouriersInjector } from './runtime';
import { EasyParcelAuthService } from './services/easyparcel-auth.service';
import { resolveSubdivision, subdivisionFromPostcode } from './subdivisions';

/** delivery-my's LiveRateProvider input (API contract §2), matched by shape. */
export interface LiveRateQuery {
    fromPostcode: string;
    toPostcode: string;
    /** State name or ISO code; the postcode is used when it is missing or unknown. */
    toState?: string | null;
    weightKg: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
}

export interface LiveRate {
    courier: string;
    service: string;
    priceSen: number;
    serviceId: string;
}

/**
 * Live EasyParcel rates for checkout, using the channel's connected account (or the default channel's).
 * Never throws: when EasyParcel is not connected, slow or down it returns [] so delivery-my falls back
 * to its zone × weight table and checkout carries on. Identical queries are answered from a short cache.
 */
@Injectable()
export class EasyParcelRateService {
    private cache = new Map<string, { expires: number; rates: LiveRate[] }>();

    constructor(
        private auth: EasyParcelAuthService,
        @Inject(COURIERS_OPTIONS) private options: ResolvedCouriersOptions,
    ) {}

    async getRates(ctx: RequestContext, query: LiveRateQuery): Promise<LiveRate[]> {
        if (!this.auth.configured) return [];
        const from = (query.fromPostcode ?? '').trim();
        const to = (query.toPostcode ?? '').trim();
        const origin = this.options.origin;
        const fromCode = from === origin.postcode ? resolveSubdivision(origin.state, origin.postcode) : subdivisionFromPostcode(from);
        const toCode = resolveSubdivision(query.toState, to);
        if (!fromCode || !toCode || !(query.weightKg > 0)) return [];

        const dimension = (value: number | undefined) => (value && value > 0 ? round2(value) : undefined);
        const shipment: QuotationShipment = {
            sender: { postcode: from, subdivision_code: fromCode, country: 'MY' },
            receiver: { postcode: to, subdivision_code: toCode, country: 'MY' },
            weight: round2(Math.max(query.weightKg, 0.1)),
            ...(dimension(query.lengthCm) ? { length: dimension(query.lengthCm) } : {}),
            ...(dimension(query.widthCm) ? { width: dimension(query.widthCm) } : {}),
            ...(dimension(query.heightCm) ? { height: dimension(query.heightCm) } : {}),
        };
        let account: string;
        try {
            account = await this.auth.connectionChannelId(ctx.channelId);
        } catch {
            return [];
        }
        const key = JSON.stringify([account, shipment]);
        const cached = this.cache.get(key);
        if (cached && cached.expires > Date.now()) return cached.rates;
        try {
            const [result] = await this.auth.api(account).quote([shipment]);
            const rates = (result?.status === 'success' ? (result.quotations ?? []) : [])
                .filter(q => matchesCollection(q, this.options.easyParcel.collection))
                .map(q => ({ courier: q.courier.courier_name, service: q.courier.service_name, serviceId: q.courier.service_id, priceSen: toSen(q.pricing?.total_amount) }))
                .filter((rate): rate is LiveRate => rate.priceSen !== undefined)
                .sort((a, b) => a.priceSen - b.priceSen);
            this.remember(key, rates);
            return rates;
        } catch (error) {
            Logger.warn(`EasyParcel rates unavailable: ${(error as Error).message}`, loggerCtx);
            return [];
        }
    }

    private remember(key: string, rates: LiveRate[]) {
        if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { expires: Date.now() + this.options.easyParcel.rateCacheMs, rates });
    }
}

/**
 * delivery-my's `LiveRateProvider` (contract §2), by shape:
 *   MalaysianDeliveryPlugin.init({ liveRateProviders: [easyParcelRateProvider] })
 * Works once MalaysianCouriersPlugin is in the config; returns [] otherwise.
 */
export const easyParcelRateProvider = {
    code: 'easyparcel',
    /** Optional: accepts the injector if the caller initialises providers like Vendure strategies. */
    init(injector: Injector) {
        if (!couriersInjector()) setCouriersInjector(injector);
    },
    async getRates(ctx: RequestContext, query: LiveRateQuery): Promise<LiveRate[]> {
        const injector = couriersInjector();
        if (!injector) {
            Logger.warn('easyParcelRateProvider was called but MalaysianCouriersPlugin is not running.', loggerCtx);
            return [];
        }
        return injector.get(EasyParcelRateService).getRates(ctx, query);
    },
};
