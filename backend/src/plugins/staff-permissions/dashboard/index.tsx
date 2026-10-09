import {
    api,
    Button,
    ConfigurableOperationInput,
    defineDashboardExtension,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { orderCanShip, unshippedLines } from '../shipping';

const HANDLERS_QUERY = `
    query ShipOrderHandlers {
        fulfillmentHandlers {
            code
            description
            args {
                name
                type
                required
                defaultValue
                list
                ui
                label
                description
            }
        }
    }
`;

const SHIP_MUTATION = `
    mutation ShipOrder($input: ShipOrderInput!) {
        shipOrder(input: $input) {
            __typename
            ... on Fulfillment {
                id
                state
            }
            ... on ErrorResult {
                message
            }
            ... on FulfillmentStateTransitionError {
                transitionError
            }
        }
    }
`;

const DELIVERED_MUTATION = `
    mutation MarkFulfillmentDelivered($fulfillmentId: ID!) {
        markFulfillmentDelivered(fulfillmentId: $fulfillmentId) {
            __typename
            ... on Fulfillment {
                id
                state
            }
            ... on FulfillmentStateTransitionError {
                message
                transitionError
            }
        }
    }
`;

type Line = { id: string; quantity: number; productVariant: { name: string; sku: string } };
type Fulfillment = { id: string; state: string; method: string; trackingCode?: string | null; lines: Array<{ orderLineId: string; quantity: number }> };
type OrderEntity = {
    id: string;
    state: string;
    nextStates: string[];
    lines: Line[];
    fulfillments?: Fulfillment[] | null;
    shippingLines?: Array<{ shippingMethod?: { fulfillmentHandlerCode?: string | null } | null }>;
};
type ArgDef = { name: string; type: string; required: boolean; defaultValue?: unknown; list: boolean; ui?: unknown; label?: string | null; description?: string | null };
type HandlerDef = { code: string; description: string; args: ArgDef[] };
type HandlerInput = { code: string; arguments: Array<{ name: string; value: string }> };
type MutationResult = { __typename: string; message?: string; transitionError?: string };

// Same starting values as the dashboard's own "Fulfill order" dialog.
const initialArgValue = (arg: ArgDef) => {
    if (arg.list) return arg.defaultValue != null ? JSON.stringify([arg.defaultValue]) : '[]';
    if (arg.defaultValue != null) return String(arg.defaultValue);
    return arg.type === 'boolean' ? 'false' : '';
};
const handlerInput = (handler: HandlerDef): HandlerInput => ({
    code: handler.code,
    arguments: handler.args.map(arg => ({ name: arg.name, value: initialArgValue(arg) })),
});
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const inTransit = (order: OrderEntity) => (order.fulfillments ?? []).filter(f => f.state === 'Pending' || f.state === 'Shipped');

/** For staff with ShipOrder: ship what is left on the order, then mark parcels delivered. */
function ShipOrder({ context }: { context: { entity?: OrderEntity } }) {
    const order = context.entity as OrderEntity;
    const queryClient = useQueryClient();
    const toShip = useMemo(() => unshippedLines(order.lines, order.fulfillments ?? []), [order]);
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [handler, setHandler] = useState<HandlerInput | null>(null);
    const [handlerValid, setHandlerValid] = useState(true);

    const { data } = useQuery({
        queryKey: ['shipOrderHandlers'],
        queryFn: () => api.query(HANDLERS_QUERY) as Promise<{ fulfillmentHandlers: HandlerDef[] }>,
        staleTime: 5 * 60 * 1000,
    });
    const handlers = data?.fulfillmentHandlers ?? [];
    const handlerDef = handlers.find(h => h.code === handler?.code);

    // Start with everything left to ship, using the handler of the order's delivery method.
    useEffect(() => setQuantities(Object.fromEntries(toShip.map(l => [String(l.orderLineId), l.quantity]))), [toShip]);
    useEffect(() => {
        if (handler || !handlers.length) return;
        const preferred = order.shippingLines?.[0]?.shippingMethod?.fulfillmentHandlerCode;
        setHandler(handlerInput(handlers.find(h => h.code === preferred) ?? handlers[0]));
    }, [handlers, handler, order]);

    const refreshOrder = () => queryClient.invalidateQueries({ queryKey: ['DetailPage', 'order'] });
    const ship = useMutation({
        mutationFn: (input: { orderId: string; lines: Array<{ orderLineId: string; quantity: number }>; handler: HandlerInput }) =>
            api.mutate(SHIP_MUTATION, { input }) as Promise<{ shipOrder: MutationResult }>,
        onSuccess: ({ shipOrder }) => {
            if (shipOrder.__typename === 'Fulfillment') toast.success('Marked shipped');
            else toast.error('Not marked shipped', { description: shipOrder.transitionError || shipOrder.message });
            void refreshOrder();
        },
        onError: e => toast.error('Not shipped', { description: errorMessage(e) }),
    });
    const deliver = useMutation({
        mutationFn: (fulfillmentId: string) => api.mutate(DELIVERED_MUTATION, { fulfillmentId }) as Promise<{ markFulfillmentDelivered: MutationResult }>,
        onSuccess: ({ markFulfillmentDelivered: result }) => {
            if (result.__typename === 'Fulfillment') toast.success('Marked delivered');
            else toast.error('Not marked delivered', { description: result.transitionError || result.message });
            void refreshOrder();
        },
        onError: e => toast.error('Not marked delivered', { description: errorMessage(e) }),
    });

    const lines = toShip
        .map(l => ({ orderLineId: String(l.orderLineId), quantity: quantities[String(l.orderLineId)] ?? 0 }))
        .filter(l => l.quantity > 0);
    const quantitiesValid = toShip.every(l => {
        const q = quantities[String(l.orderLineId)] ?? 0;
        return Number.isInteger(q) && q >= 0 && q <= l.quantity;
    });
    const canShip = orderCanShip(order.state, order.nextStates ?? []) && toShip.length > 0;
    const canSubmit = canShip && lines.length > 0 && quantitiesValid && !!handler && handlerValid && !ship.isPending;
    const lineName = (orderLineId: string) => order.lines.find(l => l.id === orderLineId)?.productVariant;

    const submit = () => {
        if (canSubmit && handler) ship.mutate({ orderId: order.id, lines, handler });
    };

    return (
        <div className="space-y-6">
            {canShip ? (
                // Not a <form>: the order page is already one form, and forms can't nest. Enter in a field
                // would submit that page form, so it is stopped here.
                <div
                    className="space-y-4"
                    onKeyDown={e => {
                        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
                    }}
                >
                    <ul className="divide-y rounded-md border">
                        {toShip.map(l => {
                            const id = String(l.orderLineId);
                            const variant = lineName(id);
                            return (
                                <li key={id} className="flex items-center justify-between gap-4 p-3">
                                    <div>
                                        <p className="font-medium">{variant?.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {variant?.sku} · {l.quantity} to ship
                                        </p>
                                    </div>
                                    <Input
                                        type="number"
                                        className="w-20"
                                        min={0}
                                        max={l.quantity}
                                        aria-label={`Quantity of ${variant?.name ?? 'item'} to ship`}
                                        value={quantities[id] ?? 0}
                                        onChange={e => setQuantities(q => ({ ...q, [id]: Number.parseInt(e.target.value, 10) || 0 }))}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                    {handlers.length ? (
                        <div className="space-y-3">
                            <Select
                                items={Object.fromEntries(handlers.map(h => [h.code, h.description]))}
                                value={handler?.code ?? ''}
                                onValueChange={code => {
                                    const def = handlers.find(h => h.code === code);
                                    if (def) setHandler(handlerInput(def));
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="How it ships" />
                                </SelectTrigger>
                                <SelectContent>
                                    {handlers.map(h => (
                                        <SelectItem key={h.code} value={h.code}>
                                            {h.description}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {handlerDef && handler ? (
                                <ConfigurableOperationInput
                                    operationDefinition={handlerDef as never}
                                    value={handler}
                                    onChange={value => setHandler(value as HandlerInput)}
                                    onValidityChange={setHandlerValid}
                                    removable={false}
                                    hideDescription
                                />
                            ) : null}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Loading delivery options…</p>
                    )}
                    <Button type="button" disabled={!canSubmit} onClick={submit}>
                        {ship.isPending ? 'Shipping…' : 'Mark shipped'}
                    </Button>
                </div>
            ) : null}

            {inTransit(order).length ? (
                <div className="space-y-2">
                    <p className="text-sm font-medium">On the way</p>
                    <ul className="divide-y rounded-md border">
                        {inTransit(order).map(f => (
                            <li key={f.id} className="flex items-center justify-between gap-4 p-3">
                                <div className="text-sm">
                                    <p className="font-medium">
                                        {f.method || 'Parcel'}
                                        {f.trackingCode ? ` · ${f.trackingCode}` : ''}
                                    </p>
                                    <p className="text-muted-foreground">
                                        {f.state} ·{' '}
                                        {f.lines.map(l => `${l.quantity} × ${lineName(l.orderLineId)?.name ?? 'item'}`).join(', ')}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={deliver.isPending}
                                    onClick={() => deliver.mutate(f.id)}
                                >
                                    Mark delivered
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

defineDashboardExtension({
    pageBlocks: [
        {
            id: 'ship-order',
            title: 'Ship order',
            location: { pageId: 'order-detail', column: 'main', position: { blockId: 'order-table', order: 'after' } },
            requiresPermission: ['ShipOrder'],
            shouldRender: context => {
                const order = context.entity as OrderEntity | undefined;
                if (!order?.lines) return false;
                const leftToShip = orderCanShip(order.state, order.nextStates ?? []) && unshippedLines(order.lines, order.fulfillments ?? []).length > 0;
                return leftToShip || inTransit(order).length > 0;
            },
            component: ShipOrder,
        },
    ],
});
