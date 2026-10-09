import { Inject, Injectable, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import {
    ChannelService,
    EventBus,
    Fulfillment,
    FulfillmentEvent,
    FulfillmentStateTransitionEvent,
    ID,
    idsAreEqual,
    isGraphQlErrorResult,
    JobQueue,
    JobQueueService,
    Logger,
    Order,
    OrderService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { In, IsNull, MoreThan, Not } from 'typeorm';
import { EasyParcelApi, EasyParcelTrackingResult, LabelSize, parseEasyParcelTime, withLabelSize } from '../clients/easyparcel';
import { EasyParcelWebhookEvent } from '../clients/easyparcel-webhook';
import { lastStopPodStatus, LalamoveOrder } from '../clients/lalamove';
import { LalamoveWebhookEvent } from '../clients/lalamove-webhook';
import { COURIERS_OPTIONS, loggerCtx, SYNC_QUEUE } from '../constants';
import { randomToken } from '../crypto';
import { CourierShipmentEvent } from '../entities/courier-shipment-event.entity';
import { ResolvedCouriersOptions } from '../options';
import { hasChanges, isStaleEvent, planShipmentUpdate, ShipmentObservation, ShipmentPlan, ShipmentSnapshot } from '../shipment-plan';
import { easyParcelStatus, lalamoveStatus } from '../status';
import { CourierFulfillmentFields, FINAL_SHIPMENT_STATUSES, isFinalShipmentStatus, ShipmentStatus } from '../types';
import { CourierBookingService } from './courier-booking.service';
import { EasyParcelAuthService } from './easyparcel-auth.service';
import { ordersByFulfillment, ownChannel } from './fulfillment-orders';

/** A verified webhook, queued for the worker. Only identifiers travel: the state is re-fetched. */
export interface SyncJob {
    provider: 'lalamove' | 'easyparcel';
    eventKey: string;
    eventType: string;
    orderId?: string;
    prevOrderId?: string;
    /** Lalamove status the event announced (checked against the API, never applied directly). */
    status?: string;
    occurredAt?: string;
    shipmentNumber?: string;
    awbNumber?: string;
}

export interface ReconcileSummary {
    checked: number;
    updated: number;
    shipped: number;
    delivered: number;
    failedOrCancelled: number;
    errors: number;
    tokensRefreshed: number;
}

interface ApplyMeta {
    provider: string;
    source: 'webhook' | 'reconcile' | 'refresh';
    /** Recorded when given, so the same webhook is not processed twice. */
    eventKey?: string;
    providerStatus?: string;
}

function fields(fulfillment: Fulfillment): CourierFulfillmentFields {
    return (fulfillment.customFields ?? {}) as CourierFulfillmentFields;
}

export function snapshotOf(fulfillment: Fulfillment): ShipmentSnapshot {
    const custom = fields(fulfillment);
    return {
        fulfillmentState: fulfillment.state,
        status: custom.shipmentStatus,
        lastEventAt: custom.lastEventAt,
        providerOrderId: custom.providerOrderId,
        trackingCode: fulfillment.trackingCode,
        trackingUrl: custom.trackingUrl,
        labelUrl: custom.labelUrl,
    };
}

export function lalamoveObservation(order: LalamoveOrder, eventAt?: Date): ShipmentObservation {
    return {
        status: lalamoveStatus(order.status, lastStopPodStatus(order)),
        providerStatus: order.status,
        eventAt,
        trackingUrl: order.shareLink,
    };
}

/**
 * Keeps fulfillments in step with the couriers. Webhooks are verified by the controller and queued here;
 * the worker re-fetches the shipment from the provider and applies what it reports. A scheduled task
 * re-checks open shipments in case a webhook never arrives.
 */
@Injectable()
export class ShipmentSyncService implements OnModuleInit, OnApplicationBootstrap {
    private queue: JobQueue<SyncJob>;

    constructor(
        private connection: TransactionalConnection,
        private jobQueueService: JobQueueService,
        private requestContextService: RequestContextService,
        private channelService: ChannelService,
        private orderService: OrderService,
        private eventBus: EventBus,
        private booking: CourierBookingService,
        private easyParcelAuth: EasyParcelAuthService,
        @Inject(COURIERS_OPTIONS) private options: ResolvedCouriersOptions,
    ) {}

    async onModuleInit() {
        this.queue = await this.jobQueueService.createQueue({
            name: SYNC_QUEUE,
            process: job => this.process(job.data),
        });
    }

    onApplicationBootstrap() {
        this.eventBus.ofType(FulfillmentEvent).subscribe(event => {
            const custom = fields(event.entity);
            if (!custom.provider) return;
            void this.recordEvent({
                fulfillmentId: event.entity.id,
                provider: custom.provider,
                providerOrderId: custom.providerOrderId,
                source: 'booking',
                status: custom.shipmentStatus ?? 'booked',
                providerStatus: event.entity.method,
                occurredAt: new Date(),
            });
        });
        this.eventBus.ofType(FulfillmentStateTransitionEvent).subscribe(event => {
            this.onFulfillmentTransition(event).catch(error =>
                Logger.warn(`Could not record the shipment status for fulfillment ${event.fulfillment.id}: ${(error as Error).message}`, loggerCtx),
            );
        });
    }

    // ── Webhooks ─────────────────────────────────────────────────────────

    async isProcessed(eventKey: string): Promise<boolean> {
        return (await this.connection.rawConnection.getRepository(CourierShipmentEvent).count({ where: { eventKey } })) > 0;
    }

    async enqueueLalamove(event: LalamoveWebhookEvent): Promise<void> {
        await this.queue.add(
            {
                provider: 'lalamove',
                eventKey: event.eventKey,
                eventType: event.eventType,
                orderId: event.orderId,
                prevOrderId: event.prevOrderId,
                status: event.status,
                occurredAt: event.occurredAt?.toISOString(),
            },
            { retries: 4 },
        );
    }

    async enqueueEasyParcel(event: EasyParcelWebhookEvent): Promise<void> {
        await this.queue.add(
            { provider: 'easyparcel', eventKey: event.eventKey, eventType: event.topic, shipmentNumber: event.shipmentNumber, awbNumber: event.awbNumber },
            { retries: 4 },
        );
    }

    async process(job: SyncJob): Promise<void> {
        if (await this.isProcessed(job.eventKey)) return;
        if (job.provider === 'lalamove') await this.processLalamove(job);
        else await this.processEasyParcel(job);
    }

    private async processLalamove(job: SyncJob): Promise<void> {
        if (!job.orderId) return;
        // ORDER_REPLACED: Lalamove cancelled the order and cloned it under a new id.
        const replaced = !!job.prevOrderId && job.prevOrderId !== job.orderId;
        const fulfillment = await this.findByProviderOrder('lalamove', replaced ? [job.prevOrderId!, job.orderId] : [job.orderId]);
        if (!fulfillment) {
            // Not ours (another shop on the same Lalamove account), a replaced order's old id, or a test event.
            Logger.verbose(`Lalamove ${job.eventType} for unknown order ${job.orderId}`, loggerCtx);
            return;
        }
        const occurredAt = job.occurredAt ? new Date(job.occurredAt) : undefined;
        if (!replaced && isStaleEvent(snapshotOf(fulfillment), occurredAt)) {
            await this.recordEvent({
                fulfillmentId: fulfillment.id,
                provider: 'lalamove',
                providerOrderId: job.orderId,
                source: 'webhook',
                eventKey: job.eventKey,
                status: null,
                providerStatus: `${job.eventType} ${job.status ?? ''} (older than the last update)`.trim(),
                occurredAt,
            });
            return;
        }
        const orderId = replaced ? job.orderId : fields(fulfillment).providerOrderId || job.orderId;
        const order = await this.booking.lalamove().getOrder(orderId);
        const observation: ShipmentObservation = {
            ...lalamoveObservation(order, occurredAt),
            ...(replaced ? { providerOrderId: order.orderId, trackingCode: order.orderId } : {}),
        };
        // An event announcing a final status the API doesn't show yet is looked at again by a job retry. (The
        // API may legitimately end elsewhere: COMPLETED with a failed proof of delivery reads as failed.)
        const announced = lalamoveStatus(job.status);
        const lagging = !!announced && isFinalShipmentStatus(announced) && !isFinalShipmentStatus(observation.status);
        await this.apply(fulfillment.id, observation, {
            provider: 'lalamove',
            source: 'webhook',
            eventKey: lagging ? undefined : job.eventKey,
            providerStatus: `${job.eventType}: ${order.status}`,
        });
        if (lagging) throw new Error(`Lalamove still reports ${order.status} for ${orderId} after a ${job.status} webhook; checking again.`);
    }

    private async processEasyParcel(job: SyncJob): Promise<void> {
        const fulfillment = await this.findEasyParcelShipment(job.shipmentNumber, job.awbNumber);
        if (!fulfillment) {
            // Shops sharing the developer app receive each other's webhooks; those shipments aren't here.
            Logger.verbose(`EasyParcel ${job.eventType} for unknown shipment ${job.shipmentNumber ?? job.awbNumber}`, loggerCtx);
            return;
        }
        const observation = await this.observeEasyParcel(fulfillment);
        await this.apply(fulfillment.id, observation, { provider: 'easyparcel', source: 'webhook', eventKey: job.eventKey, providerStatus: observation.providerStatus });
    }

    // ── Reconcile ────────────────────────────────────────────────────────

    /** Re-checks every open courier shipment (scheduled every 30 minutes) and refreshes expiring EasyParcel tokens. */
    async reconcile(): Promise<ReconcileSummary> {
        const summary: ReconcileSummary = { checked: 0, updated: 0, shipped: 0, delivered: 0, failedOrCancelled: 0, errors: 0, tokensRefreshed: 0 };
        summary.tokensRefreshed = await this.easyParcelAuth.refreshExpiring();
        const open = await this.openShipments();
        const count = (plan: ShipmentPlan) => {
            if (hasChanges(plan) || plan.transitionTo) summary.updated++;
            if (plan.transitionTo === 'Shipped') summary.shipped++;
            if (plan.transitionTo === 'Delivered') summary.delivered++;
            if (plan.changes.status === 'failed' || plan.changes.status === 'cancelled') summary.failedOrCancelled++;
        };

        for (const fulfillment of open.filter(f => fields(f).provider === 'lalamove')) {
            summary.checked++;
            try {
                const order = await this.booking.lalamove().getOrder(fields(fulfillment).providerOrderId!);
                count(await this.apply(fulfillment.id, lalamoveObservation(order), { provider: 'lalamove', source: 'reconcile', providerStatus: order.status }));
            } catch (error) {
                summary.errors++;
                Logger.warn(`Reconcile: Lalamove order ${fields(fulfillment).providerOrderId}: ${(error as Error).message}`, loggerCtx);
            }
        }

        // EasyParcel: one tracking call per connected account for up to 50 AWBs at a time.
        const easyParcelShipments = open.filter(f => fields(f).provider === 'easyparcel');
        const orders = await ordersByFulfillment(this.connection, easyParcelShipments.map(f => f.id));
        const defaultChannel = await this.channelService.getDefaultChannel();
        const accountOfChannel = new Map<string, Promise<string>>();
        const byAccount = new Map<string, Fulfillment[]>();
        for (const fulfillment of easyParcelShipments) {
            try {
                const channelId = String(ownChannel(orders.get(String(fulfillment.id)) ?? [], defaultChannel).id);
                if (!accountOfChannel.has(channelId)) accountOfChannel.set(channelId, this.easyParcelAuth.connectionChannelId(channelId));
                const account = await accountOfChannel.get(channelId)!;
                byAccount.set(account, [...(byAccount.get(account) ?? []), fulfillment]);
            } catch (error) {
                summary.checked++;
                summary.errors++;
                Logger.warn(`Reconcile: EasyParcel shipment ${fields(fulfillment).providerOrderId}: ${(error as Error).message}`, loggerCtx);
            }
        }
        for (const [account, shipments] of byAccount) {
            const api = this.easyParcelAuth.api(account);
            let tracking: EasyParcelTrackingResult[] = [];
            const awbs = shipments.map(f => f.trackingCode).filter(Boolean);
            try {
                tracking = awbs.length ? await api.trackingStatus(awbs) : [];
            } catch (error) {
                Logger.warn(`Reconcile: EasyParcel tracking: ${(error as Error).message}`, loggerCtx);
            }
            for (const fulfillment of shipments) {
                summary.checked++;
                try {
                    const track = tracking.find(r => r.awb_number === fulfillment.trackingCode && r.status === 'success');
                    const observation = await this.observeEasyParcel(fulfillment, { api, track });
                    count(await this.apply(fulfillment.id, observation, { provider: 'easyparcel', source: 'reconcile', providerStatus: observation.providerStatus }));
                } catch (error) {
                    summary.errors++;
                    Logger.warn(`Reconcile: EasyParcel shipment ${fields(fulfillment).providerOrderId}: ${(error as Error).message}`, loggerCtx);
                }
            }
        }
        Logger.info(`Reconciled courier shipments: ${JSON.stringify(summary)}`, loggerCtx);
        return summary;
    }

    /** Re-checks one shipment now (admin route). */
    async refreshFulfillment(ctx: RequestContext, fulfillmentId: ID): Promise<{ shipmentStatus: string | null; state: string }> {
        if (!(await this.belongsToChannel(fulfillmentId, ctx.channelId))) throw new Error(`Fulfillment ${fulfillmentId} was not found.`);
        const fulfillment = await this.connection.rawConnection.getRepository(Fulfillment).findOne({ where: { id: fulfillmentId } });
        const provider = fulfillment ? fields(fulfillment).provider : undefined;
        if (!fulfillment || (provider !== 'lalamove' && provider !== 'easyparcel') || !fields(fulfillment).providerOrderId) {
            throw new Error('Only Lalamove and EasyParcel shipments can be refreshed.');
        }
        const observation =
            provider === 'lalamove'
                ? lalamoveObservation(await this.booking.lalamove().getOrder(fields(fulfillment).providerOrderId!))
                : await this.observeEasyParcel(fulfillment);
        await this.apply(fulfillment.id, observation, { provider, source: 'refresh', providerStatus: observation.providerStatus });
        const updated = await this.connection.rawConnection.getRepository(Fulfillment).findOneOrFail({ where: { id: fulfillmentId } });
        return { shipmentStatus: fields(updated).shipmentStatus ?? null, state: updated.state };
    }

    // ── Applying updates ─────────────────────────────────────────────────

    private async observeEasyParcel(
        fulfillment: Fulfillment,
        prefetched: { api?: EasyParcelApi; track?: EasyParcelTrackingResult } = {},
    ): Promise<ShipmentObservation> {
        const custom = fields(fulfillment);
        const api = prefetched.api ?? this.easyParcelAuth.api(await this.easyParcelAuth.accountForFulfillment(fulfillment.id));
        const prefetchedStatus = prefetched.track
            ? easyParcelStatus(prefetched.track.latest_shipment_status_code, prefetched.track.latest_tracking_status)
            : undefined;
        // Details give what tracking doesn't: the AWB, the links, and a cancellation made on EasyParcel's side
        // (only possible before the courier has the parcel, so while it is still booked).
        const needsDetails =
            !prefetched.track || !fulfillment.trackingCode || !custom.trackingUrl || !custom.labelUrl || (prefetchedStatus ?? 'booked') === 'booked';
        const details = needsDetails ? (await api.shipmentDetails(custom.providerOrderId!))?.shipment_details : undefined;
        const awb = details?.awb_number || fulfillment.trackingCode || undefined;
        const track =
            prefetched.track ?? (awb ? (await api.trackingStatus([awb])).find(r => r.awb_number === awb && r.status === 'success') : undefined);
        const fromDetails = easyParcelStatus(details?.shipment_status_code, details?.shipment_status);
        const fromTracking = track ? easyParcelStatus(track.latest_shipment_status_code, track.latest_tracking_status) : undefined;
        const status: ShipmentStatus | undefined = fromDetails === 'cancelled' ? 'cancelled' : (fromTracking ?? fromDetails);
        const labelSize = (['A4', 'A5', 'A6'].includes(custom.labelSize ?? '') ? custom.labelSize : this.options.easyParcel.defaultLabelSize) as LabelSize;
        return {
            status,
            providerStatus: (track?.latest_tracking_status ?? details?.shipment_status ?? undefined)?.slice(0, 255),
            eventAt: parseEasyParcelTime(track?.latest_event_date),
            trackingCode: awb,
            trackingUrl: details?.tracking_url,
            // The booking stored the label when it had one; otherwise it comes with the AWB, in the size chosen then.
            labelUrl: custom.labelUrl ? undefined : withLabelSize(details?.awb_url, labelSize),
            forwardOnly: true,
        };
    }

    /** Saves what changed, moves the fulfillment to Shipped / Delivered when due, and logs the event. */
    private async apply(fulfillmentId: ID, observation: ShipmentObservation, meta: ApplyMeta): Promise<ShipmentPlan> {
        const repository = this.connection.rawConnection.getRepository(Fulfillment);
        const fulfillment = await repository.findOneOrFail({ where: { id: fulfillmentId } });
        const plan = planShipmentUpdate(snapshotOf(fulfillment), observation);
        const { trackingCode, status, providerOrderId, trackingUrl, labelUrl, lastEventAt } = plan.changes;
        const customFields: CourierFulfillmentFields = {
            ...(status ? { shipmentStatus: status } : {}),
            ...(providerOrderId ? { providerOrderId } : {}),
            ...(trackingUrl ? { trackingUrl } : {}),
            ...(labelUrl ? { labelUrl } : {}),
            ...(lastEventAt ? { lastEventAt } : {}),
        };
        if (hasChanges(plan)) {
            await repository.update(fulfillment.id, {
                ...(trackingCode ? { trackingCode } : {}),
                ...(Object.keys(customFields).length ? { customFields } : {}),
            });
        }
        if (plan.transitionTo) await this.transition(fulfillment.id, plan.transitionTo);
        if (meta.eventKey || plan.statusChanged) {
            await this.recordEvent({
                fulfillmentId: fulfillment.id,
                provider: meta.provider,
                providerOrderId: providerOrderId ?? fields(fulfillment).providerOrderId,
                source: meta.source,
                eventKey: meta.eventKey,
                status: status ?? null,
                providerStatus: meta.providerStatus ?? observation.providerStatus ?? null,
                occurredAt: observation.eventAt ?? null,
            });
        }
        return plan;
    }

    private async transition(fulfillmentId: ID, state: 'Shipped' | 'Delivered'): Promise<void> {
        try {
            const ctx = await this.contextFor(fulfillmentId);
            const result = await this.orderService.transitionFulfillmentToState(ctx, fulfillmentId, state);
            if (isGraphQlErrorResult(result)) {
                Logger.warn(`Fulfillment ${fulfillmentId} could not move to ${state}: ${result.transitionError ?? result.message}`, loggerCtx);
            }
        } catch (error) {
            Logger.warn(`Fulfillment ${fulfillmentId} could not move to ${state}: ${(error as Error).message}`, loggerCtx);
        }
    }

    /** Keeps `shipmentStatus` in step with staff actions: cancellations, and every step of a manual courier. */
    private async onFulfillmentTransition(event: FulfillmentStateTransitionEvent): Promise<void> {
        const custom = fields(event.fulfillment);
        if (!custom.provider) return;
        let status: ShipmentStatus | undefined;
        if (event.toState === 'Cancelled') {
            status = isFinalShipmentStatus(custom.shipmentStatus) ? undefined : 'cancelled';
        } else if (custom.provider === 'manual') {
            if (event.toState === 'Shipped' && (!custom.shipmentStatus || custom.shipmentStatus === 'booked')) status = 'in_transit';
            if (event.toState === 'Delivered') status = 'delivered';
        }
        if (!status) return;
        const now = new Date();
        // lastEventAt orders courier webhooks, so it only takes this server's clock for manual couriers.
        await this.connection.rawConnection
            .getRepository(Fulfillment)
            .update(event.fulfillment.id, { customFields: { shipmentStatus: status, ...(custom.provider === 'manual' ? { lastEventAt: now } : {}) } });
        await this.recordEvent({
            fulfillmentId: event.fulfillment.id,
            provider: custom.provider,
            providerOrderId: custom.providerOrderId,
            source: 'staff',
            status,
            providerStatus: `Fulfillment ${event.fromState} → ${event.toState}`,
            occurredAt: now,
        });
    }

    private async recordEvent(input: {
        fulfillmentId: ID;
        provider: string;
        providerOrderId?: string | null;
        source: string;
        eventKey?: string;
        status?: string | null;
        providerStatus?: string | null;
        occurredAt?: Date | null;
    }): Promise<void> {
        try {
            await this.connection.rawConnection.getRepository(CourierShipmentEvent).insert(
                new CourierShipmentEvent({
                    fulfillmentId: String(input.fulfillmentId),
                    provider: input.provider,
                    providerOrderId: input.providerOrderId ?? null,
                    eventKey: input.eventKey ?? `${input.source}:${input.fulfillmentId}:${Date.now()}:${randomToken(6)}`,
                    source: input.source,
                    status: input.status ?? null,
                    providerStatus: input.providerStatus?.slice(0, 255) ?? null,
                    occurredAt: input.occurredAt ?? null,
                }),
            );
        } catch (error) {
            // A duplicate eventKey means another delivery of the same webhook got here first.
            Logger.verbose(`Shipment event not recorded: ${(error as Error).message}`, loggerCtx);
        }
    }

    // ── Lookups ──────────────────────────────────────────────────────────

    /**
     * Courier shipments still in progress. A shipment the courier reports delivered stays in the list
     * until its fulfillment is Delivered too, so a transition that failed once is tried again.
     */
    private async openShipments(): Promise<Fulfillment[]> {
        const since = new Date(Date.now() - this.options.reconcileMaxAgeDays * 86_400_000);
        const base = { state: Not(In(['Cancelled', 'Delivered'])), createdAt: MoreThan(since) };
        const provider = In(['lalamove', 'easyparcel']);
        const ended = FINAL_SHIPMENT_STATUSES.filter(status => status !== 'delivered');
        return this.connection.rawConnection.getRepository(Fulfillment).find({
            where: [
                { ...base, customFields: { provider, providerOrderId: Not(IsNull()), shipmentStatus: IsNull() } },
                { ...base, customFields: { provider, providerOrderId: Not(IsNull()), shipmentStatus: Not(In(ended)) } },
            ],
            order: { createdAt: 'ASC' },
            take: 500,
        });
    }

    private async findByProviderOrder(provider: string, ids: string[]): Promise<Fulfillment | null> {
        return this.connection.rawConnection.getRepository(Fulfillment).findOne({
            where: ids.map(id => ({ customFields: { provider, providerOrderId: id } })),
            order: { createdAt: 'DESC' },
        });
    }

    private async findEasyParcelShipment(shipmentNumber?: string, awbNumber?: string): Promise<Fulfillment | null> {
        const repository = this.connection.rawConnection.getRepository(Fulfillment);
        if (shipmentNumber) {
            const byNumber = await repository.findOne({ where: { customFields: { provider: 'easyparcel', providerOrderId: shipmentNumber } } });
            if (byNumber) return byNumber;
        }
        if (awbNumber) {
            return repository.findOne({ where: { trackingCode: awbNumber, customFields: { provider: 'easyparcel' } }, order: { createdAt: 'DESC' } });
        }
        return null;
    }

    private async ordersOf(fulfillmentId: ID): Promise<Order[]> {
        return (await ordersByFulfillment(this.connection, [fulfillmentId])).get(String(fulfillmentId)) ?? [];
    }

    private async belongsToChannel(fulfillmentId: ID, channelId: ID): Promise<boolean> {
        const orders = await this.ordersOf(fulfillmentId);
        return orders.length > 0 && orders.every(order => order.channels.some(channel => idsAreEqual(channel.id, channelId)));
    }

    /** A system context in the order's own channel: fulfillment transitions are checked against it. */
    private async contextFor(fulfillmentId: ID): Promise<RequestContext> {
        const channel = ownChannel(await this.ordersOf(fulfillmentId), await this.channelService.getDefaultChannel());
        return this.requestContextService.create({ apiType: 'admin', channelOrToken: channel });
    }
}
