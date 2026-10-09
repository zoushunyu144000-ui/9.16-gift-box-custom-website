import { Inject, Injectable } from '@nestjs/common';
import {
    Customer,
    Fulfillment,
    ID,
    idsAreEqual,
    Logger,
    Order,
    OrderLine,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import { LabelSize, labelUrlFor, pickQuotation, toSen } from '../clients/easyparcel';
import { ProviderError } from '../clients/http';
import { buildPlaceOrderRequest, buildQuotationRequest, LalamoveClient, lalamoveAmountToSen } from '../clients/lalamove';
import { COURIERS_OPTIONS, loggerCtx } from '../constants';
import { originAddress, ResolvedCouriersOptions } from '../options';
import { buildParcel, buildSubmitShipment, defaultCollectionDate, easyParcelParty, formatAddress, ParcelLine, PostalAddress } from '../parcel';
import { toE164 } from '../phone';
import { lalamoveStatus } from '../status';
import { CourierFulfillmentFields, isFinalShipmentStatus } from '../types';
import { EasyParcelAuthService } from './easyparcel-auth.service';
import { GeocodingService } from './geocoding.service';

/** What a FulfillmentHandler returns (Vendure saves it on the new Fulfillment). */
export interface BookingResult {
    method: string;
    trackingCode: string;
    customFields: CourierFulfillmentFields;
}

export interface LalamoveBookingArgs {
    serviceType?: string;
    /** Vendure passes datetime arguments as epoch milliseconds. */
    scheduleAt?: number | Date | string;
    remarks?: string;
}

export interface EasyParcelBookingArgs {
    service?: string;
    labelSize?: string;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    collectionDate?: string;
}

interface OrderLineRef {
    orderLineId: ID;
    quantity: number;
}

/** Order custom fields from delivery-my, read when that plugin is installed. */
interface DeliveryOrderFields {
    preferredDeliveryDate?: string | null;
    deliveryNotes?: string | null;
}

/** Variant custom fields from delivery-my, read when present. */
interface VariantSizeFields {
    weightGrams?: number | null;
    lengthCm?: number | null;
    widthCm?: number | null;
    heightCm?: number | null;
}

@Injectable()
export class CourierBookingService {
    constructor(
        private connection: TransactionalConnection,
        private productVariantService: ProductVariantService,
        private geocoding: GeocodingService,
        private easyParcelAuth: EasyParcelAuthService,
        @Inject(COURIERS_OPTIONS) private options: ResolvedCouriersOptions,
    ) {}

    lalamove(): LalamoveClient {
        const config = this.options.lalamove;
        if (!config.configured) throw new ProviderError('lalamove', 'Lalamove is not configured: set LALAMOVE_API_KEY and LALAMOVE_API_SECRET.');
        return new LalamoveClient({
            apiKey: config.apiKey,
            apiSecret: config.apiSecret,
            baseUrl: config.baseUrl,
            market: config.market,
            fetch: this.options.fetch,
        });
    }

    /** Books a Lalamove driver from the shop to the order's shipping address. */
    async bookLalamove(ctx: RequestContext, orders: Order[], lines: OrderLineRef[], args: LalamoveBookingArgs): Promise<BookingResult> {
        const client = this.lalamove();
        const order = await this.singleOrder(ctx, orders);
        const recipient = this.recipient(order);
        const phone = toE164(recipient.phoneNumber);
        if (!phone) throw new Error('The shipping address needs a valid phone number for the Lalamove driver.');
        const senderPhone = toE164(this.options.origin.phone);
        if (!senderPhone) throw new Error('The shop origin phone number is not valid (couriers-my plugin options).');

        const dropoffAddress = formatAddress(recipient);
        const dropoff = await this.geocoding.geocode(dropoffAddress);
        const serviceType = (args.serviceType?.trim() || this.options.lalamove.defaultServiceType).toUpperCase();
        const scheduleAt = this.lalamoveScheduleAt(args.scheduleAt, order);
        const quotation = await client.createQuotation(
            buildQuotationRequest({
                serviceType,
                language: this.options.lalamove.language,
                pickup: { lat: this.options.origin.lat, lng: this.options.origin.lng, address: formatAddress(originAddress(this.options.origin)) },
                dropoff: { ...dropoff, address: dropoffAddress },
                scheduleAt,
            }),
        );
        const fields = order.customFields as DeliveryOrderFields;
        const remarks = [`Order ${order.code}`, recipient.company, fields.deliveryNotes, args.remarks].filter(r => r && r.trim()).join('\r\n');
        const placed = await client.placeOrder(
            buildPlaceOrderRequest(quotation, {
                sender: { name: this.options.origin.company || this.options.origin.contactName, phone: senderPhone },
                recipient: { name: recipient.fullName || 'Recipient', phone, remarks },
                proofOfDelivery: this.options.lalamove.proofOfDelivery,
                metadata: { orderCode: order.code },
            }),
        );
        const price = lalamoveAmountToSen(placed.priceBreakdown?.total ?? quotation.priceBreakdown?.total);
        Logger.info(
            `Booked Lalamove ${placed.orderId} (${serviceType}${scheduleAt ? `, pickup ${scheduleAt.toISOString()}` : ''}) for order ${order.code}${price !== undefined ? `, RM ${(price / 100).toFixed(2)}` : ''}`,
            loggerCtx,
        );
        return {
            method: `Lalamove ${serviceType.charAt(0)}${serviceType.slice(1).toLowerCase().replace(/_/g, ' ')}`,
            trackingCode: placed.orderId,
            customFields: {
                provider: 'lalamove',
                providerOrderId: placed.orderId,
                trackingUrl: placed.shareLink || null,
                labelUrl: null,
                shipmentStatus: lalamoveStatus(placed.status) ?? 'booked',
                // Only courier event times go here (webhook ordering compares them), never this server's clock.
                lastEventAt: null,
            },
        };
    }

    /** Quotes the parcel, picks the service and submits it to EasyParcel (debits the prepaid wallet). */
    async bookEasyParcel(ctx: RequestContext, orders: Order[], lines: OrderLineRef[], args: EasyParcelBookingArgs): Promise<BookingResult> {
        const channelId = await this.easyParcelAuth.connectionChannelId(ctx.channelId);
        const api = this.easyParcelAuth.api(channelId);
        const order = await this.singleOrder(ctx, orders);
        const recipient = this.recipient(order);
        const parcel = buildParcel(await this.parcelLines(ctx, lines), this.options.defaultParcel, {
            weightKg: args.weightKg,
            lengthCm: args.lengthCm,
            widthCm: args.widthCm,
            heightCm: args.heightCm,
        });
        const sender = easyParcelParty('sender', originAddress(this.options.origin));
        const receiver = easyParcelParty('receiver', recipient);

        const [quoted] = await api.quote([
            {
                sender: { postcode: sender.postcode, subdivision_code: sender.subdivision_code ?? '', country: sender.country_code },
                receiver: { postcode: receiver.postcode, subdivision_code: receiver.subdivision_code ?? '', country: receiver.country_code },
                weight: parcel.weightKg,
                length: parcel.lengthCm,
                width: parcel.widthCm,
                height: parcel.heightCm,
                parcel_value: parcel.valueSen / 100,
            },
        ]);
        if (!quoted || quoted.status !== 'success') {
            throw new ProviderError('easyparcel', `EasyParcel could not quote this parcel: ${(quoted?.errors ?? []).join('; ') || 'no rates returned'}`);
        }
        const choice = pickQuotation(quoted.quotations ?? [], args.service, this.options.easyParcel.collection);
        if ('error' in choice) throw new ProviderError('easyparcel', choice.error);
        const { courier, pricing } = choice.quotation;

        const collectionDate = args.collectionDate?.trim() || defaultCollectionDate();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) throw new Error('The collection date must be written as YYYY-MM-DD.');
        const [submitted] = await api.submitOrders([
            buildSubmitShipment({
                serviceId: courier.service_id,
                collectionDate,
                reference: order.code,
                parcel,
                sender,
                receiver,
                notifications: this.options.easyParcel.notifications,
            }),
        ]);
        if (!submitted || submitted.status !== 'success' || !submitted.shipment_number) {
            throw new ProviderError('easyparcel', `EasyParcel did not accept the shipment: ${(submitted?.errors ?? []).join('; ') || 'no shipment returned'}`);
        }
        const labelSize = (['A4', 'A5', 'A6'].includes(args.labelSize ?? '') ? args.labelSize : this.options.easyParcel.defaultLabelSize) as LabelSize;
        const price = toSen(pricing.total_amount);
        Logger.info(
            `Booked EasyParcel ${submitted.shipment_number} (${courier.service_name}, collection ${collectionDate}) for order ${order.code}${price !== undefined ? `, RM ${(price / 100).toFixed(2)}` : ''}`,
            loggerCtx,
        );
        return {
            method: `EasyParcel: ${courier.service_name}`,
            // Some couriers issue the AWB a little later; the AWB webhook or the reconcile task fills it in.
            trackingCode: submitted.awb_number || '',
            customFields: {
                provider: 'easyparcel',
                providerOrderId: submitted.shipment_number,
                trackingUrl: submitted.tracking_url || null,
                labelUrl: labelUrlFor(submitted, labelSize) ?? null,
                shipmentStatus: 'booked',
                // Only courier event times go here (webhook ordering compares them), never this server's clock.
                lastEventAt: null,
            },
        };
    }

    /**
     * Cancels the booking when staff cancel the fulfillment. Returns a message (which stops the
     * cancellation) when the provider refuses, so a paid booking is never silently left running.
     */
    async cancelAtProvider(ctx: RequestContext, fulfillment: Fulfillment): Promise<string | undefined> {
        const fields = fulfillment.customFields as CourierFulfillmentFields;
        const id = fields.providerOrderId;
        if (!id || isFinalShipmentStatus(fields.shipmentStatus)) return undefined;
        try {
            if (fields.provider === 'lalamove') {
                await this.lalamove().cancelOrder(id);
                Logger.info(`Cancelled Lalamove order ${id}`, loggerCtx);
            } else if (fields.provider === 'easyparcel') {
                const channelId = await this.easyParcelAuth.connectionChannelId(ctx.channelId);
                const result = await this.easyParcelAuth.api(channelId).cancel(id, 'Cancelled by the shop');
                if (result.status !== 'success' && !/already cancel/i.test(result.message ?? '')) {
                    return `EasyParcel would not cancel shipment ${id}: ${result.message ?? 'no reason given'}`;
                }
                Logger.info(`Cancelled EasyParcel shipment ${id}`, loggerCtx);
            }
        } catch (error) {
            return `Could not cancel the ${fields.provider === 'lalamove' ? 'Lalamove order' : 'EasyParcel shipment'} ${id}: ${(error as Error).message}`;
        }
        return undefined;
    }

    /** One booking goes to one address, so a courier fulfillment covers a single order. */
    private async singleOrder(ctx: RequestContext, orders: Order[]): Promise<Order & { customer?: Customer }> {
        if (orders.length !== 1) throw new Error('Book a courier for one order at a time.');
        const order = await this.connection.getRepository(ctx, Order).findOne({ where: { id: orders[0].id }, relations: { customer: true } });
        if (!order) throw new Error('Order not found.');
        if (!order.shippingAddress?.streetLine1) throw new Error(`Order ${order.code} has no shipping address.`);
        return order;
    }

    /** The shipping address, with the customer's name and phone where the address leaves them out. */
    private recipient(order: Order): PostalAddress {
        const address = order.shippingAddress;
        const customerName = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ');
        return {
            fullName: address.fullName || customerName,
            company: address.company,
            streetLine1: address.streetLine1,
            streetLine2: address.streetLine2,
            city: address.city,
            province: address.province,
            postalCode: address.postalCode,
            countryCode: address.countryCode || 'MY',
            phoneNumber: address.phoneNumber || order.customer?.phoneNumber,
        };
    }

    private async parcelLines(ctx: RequestContext, lines: OrderLineRef[]): Promise<ParcelLine[]> {
        const orderLines = await this.connection.getRepository(ctx, OrderLine).find({ where: { id: In(lines.map(l => l.orderLineId)) } });
        const variants = await this.productVariantService.findByIds(ctx, orderLines.map(l => l.productVariantId));
        return lines.flatMap(input => {
            const line = orderLines.find(l => idsAreEqual(l.id, input.orderLineId));
            if (!line || input.quantity <= 0) return [];
            const variant = variants.find(v => idsAreEqual(v.id, line.productVariantId));
            const size = (variant?.customFields ?? {}) as VariantSizeFields;
            return [
                {
                    name: variant?.name || variant?.sku || 'Gift',
                    quantity: input.quantity,
                    unitPriceSen: line.proratedUnitPriceWithTax,
                    weightGrams: size.weightGrams,
                    lengthCm: size.lengthCm,
                    widthCm: size.widthCm,
                    heightCm: size.heightCm,
                },
            ];
        });
    }

    /**
     * Pickup time: the one staff chose; otherwise, for a preferred delivery date after today (delivery-my),
     * that day at the usual pickup time; otherwise now (no scheduleAt).
     */
    private lalamoveScheduleAt(chosen: LalamoveBookingArgs['scheduleAt'], order: Order): Date | undefined {
        const now = Date.now();
        if (chosen !== undefined && chosen !== null && chosen !== '') {
            const at = new Date(typeof chosen === 'string' && /^\d+$/.test(chosen) ? Number(chosen) : chosen);
            if (!Number.isNaN(at.getTime()) && at.getTime() > now + 60_000) return at;
            if (!Number.isNaN(at.getTime())) return undefined;
        }
        const preferred = (order.customFields as DeliveryOrderFields).preferredDeliveryDate;
        const todayMyt = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
        if (!preferred || !/^\d{4}-\d{2}-\d{2}$/.test(preferred) || preferred <= todayMyt) return undefined;
        const [hours, minutes] = this.options.lalamove.scheduledPickupTime.split(':').map(Number);
        const at = new Date(`${preferred}T00:00:00+08:00`);
        at.setUTCMinutes(at.getUTCMinutes() + (hours || 0) * 60 + (minutes || 0));
        return at;
    }
}
