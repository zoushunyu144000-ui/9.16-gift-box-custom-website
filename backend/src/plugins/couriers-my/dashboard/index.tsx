import { defineDashboardExtension } from '@vendure/dashboard';

type Shipment = {
    id: string;
    state: string;
    method: string;
    trackingCode?: string | null;
    customFields?: {
        provider?: string | null;
        providerOrderId?: string | null;
        trackingUrl?: string | null;
        labelUrl?: string | null;
        shipmentStatus?: string | null;
        lastEventAt?: string | null;
    };
};

const PROVIDERS: Record<string, string> = { lalamove: 'Lalamove', easyparcel: 'EasyParcel', manual: 'Courier' };

const STATUSES: Record<string, { label: string; tone: string }> = {
    booked: { label: 'Booked', tone: 'bg-muted text-foreground' },
    picked_up: { label: 'Picked up', tone: 'bg-blue-100 text-blue-900' },
    in_transit: { label: 'In transit', tone: 'bg-blue-100 text-blue-900' },
    out_for_delivery: { label: 'Out for delivery', tone: 'bg-blue-100 text-blue-900' },
    delivered: { label: 'Delivered', tone: 'bg-green-100 text-green-900' },
    failed: { label: 'Delivery failed', tone: 'bg-red-100 text-red-900' },
    cancelled: { label: 'Cancelled', tone: 'bg-red-100 text-red-900' },
};

const courierShipments = (entity: { fulfillments?: Shipment[] | null } | undefined) =>
    (entity?.fulfillments ?? []).filter(f => f.customFields?.provider);

const formatTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }) : null;

/** On every order: each courier booking with its status and the tracking and label links, for packing and follow-up. */
function Shipments({ context }: { context: { entity?: { fulfillments?: Shipment[] | null } } }) {
    return (
        <ul className="divide-y">
            {courierShipments(context.entity).map(shipment => {
                const fields = shipment.customFields ?? {};
                const status = STATUSES[fields.shipmentStatus ?? ''];
                const failed = fields.shipmentStatus === 'failed' || fields.shipmentStatus === 'cancelled';
                return (
                    <li key={shipment.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">
                                {PROVIDERS[fields.provider ?? ''] ?? fields.provider} · {shipment.method}
                            </p>
                            {status ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span> : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Fulfillment {shipment.state}
                            {shipment.trackingCode ? (
                                <>
                                    {' '}· Tracking <span className="font-mono text-foreground">{shipment.trackingCode}</span>
                                </>
                            ) : null}
                            {fields.providerOrderId && fields.providerOrderId !== shipment.trackingCode ? <> · Booking {fields.providerOrderId}</> : null}
                            {formatTime(fields.lastEventAt) ? <> · Updated {formatTime(fields.lastEventAt)}</> : null}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-4 text-sm">
                            {fields.trackingUrl ? (
                                <a className="underline" href={fields.trackingUrl} target="_blank" rel="noreferrer">
                                    Tracking page
                                </a>
                            ) : null}
                            {fields.labelUrl ? (
                                <a className="underline" href={fields.labelUrl} target="_blank" rel="noreferrer">
                                    Print label
                                </a>
                            ) : null}
                        </p>
                        {failed && shipment.state !== 'Cancelled' ? (
                            <p className="mt-1 text-sm text-red-700">
                                The courier did not complete this booking. Cancel the fulfillment and book again.
                            </p>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}

defineDashboardExtension({
    pageBlocks: [
        {
            id: 'courier-shipments',
            title: 'Shipments',
            location: { pageId: 'order-detail', column: 'main', position: { blockId: 'order-table', order: 'after' } },
            shouldRender: context => courierShipments(context.entity).length > 0,
            component: Shipments,
        },
    ],
});
