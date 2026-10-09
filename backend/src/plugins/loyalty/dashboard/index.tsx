import {
    api,
    Badge,
    Button,
    defineDashboardExtension,
    DetailPageButton,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Textarea,
    useChannel,
    useLocalFormat,
    usePermissions,
} from '@vendure/dashboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

const LOYALTY_QUERY = `
    query CustomerLoyaltyPoints($customerId: ID!, $options: LoyaltyHistoryOptions) {
        customer(id: $customerId) {
            id
            customFields {
                loyaltyPoints
            }
        }
        loyaltySettings {
            pointValueSen
        }
        customerLoyaltyHistory(customerId: $customerId, options: $options) {
            totalItems
            items {
                id
                createdAt
                points
                reason
                note
                orderId
                orderCode
                administratorName
            }
        }
    }
`;

const ADJUST_MUTATION = `
    mutation AdjustLoyaltyPoints($customerId: ID!, $points: Int!, $note: String!) {
        adjustLoyaltyPoints(customerId: $customerId, points: $points, note: $note) {
            id
        }
    }
`;

type Entry = {
    id: string;
    createdAt: string;
    points: number;
    reason: string;
    note: string | null;
    orderId: string | null;
    orderCode: string | null;
    administratorName: string | null;
};

type LoyaltyData = {
    customer: { id: string; customFields?: { loyaltyPoints?: number | null } } | null;
    loyaltySettings: { pointValueSen: number };
    customerLoyaltyHistory: { totalItems: number; items: Entry[] };
};

const REASON_LABELS: Record<string, string> = { earned: 'Earned', redeemed: 'Used', adjusted: 'Adjusted', reversed: 'Reversed' };
const RECENT = 10;

/** On every customer: points balance, recent history and, for staff who can edit customers, an adjustment form. */
function LoyaltyPoints({ context }: { context: { entity?: { id?: string } } }) {
    const customerId = context.entity?.id ?? '';
    const queryClient = useQueryClient();
    const { hasPermissions } = usePermissions();
    const { formatCurrency, formatDate, formatNumber } = useLocalFormat();
    const { activeChannel } = useChannel();
    const currency = activeChannel?.defaultCurrencyCode ?? 'MYR';
    const [points, setPoints] = useState('');
    const [note, setNote] = useState('');

    const { data, isLoading, error } = useQuery({
        queryKey: ['loyaltyPoints', customerId],
        queryFn: () => api.query(LOYALTY_QUERY, { customerId, options: { take: RECENT } }) as Promise<LoyaltyData>,
        enabled: !!customerId,
    });

    const adjust = useMutation({
        mutationFn: (variables: { customerId: string; points: number; note: string }) => api.mutate(ADJUST_MUTATION, variables),
        onSuccess: () => {
            toast.success('Points updated');
            setPoints('');
            setNote('');
            void queryClient.invalidateQueries({ queryKey: ['loyaltyPoints', customerId] });
        },
        onError: e => toast.error('Points not changed', { description: e instanceof Error ? e.message : String(e) }),
    });

    if (isLoading) return <p className="text-sm text-muted-foreground">Loading points…</p>;
    if (error || !data) return <p className="text-sm text-destructive">Couldn’t load the points: {error instanceof Error ? error.message : 'unknown error'}</p>;

    const balance = data.customer?.customFields?.loyaltyPoints ?? 0;
    const history = data.customerLoyaltyHistory;
    const amount = Number(points);
    const canSubmit = Number.isInteger(amount) && amount !== 0 && note.trim().length > 0 && !adjust.isPending;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (canSubmit) adjust.mutate({ customerId, points: amount, note: note.trim() });
    };

    return (
        <div className="space-y-5">
            <div>
                <p className="text-3xl font-semibold tabular-nums">{formatNumber(balance)} points</p>
                <p className="text-sm text-muted-foreground">
                    Worth {formatCurrency(balance * data.loyaltySettings.pointValueSen, currency)} when used
                </p>
            </div>

            {history.items.length ? (
                <div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>What</TableHead>
                                <TableHead className="text-right">Points</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.items.map(entry => (
                                <TableRow key={entry.id}>
                                    <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                                        {formatDate(entry.createdAt, { dateStyle: 'medium' })}
                                    </TableCell>
                                    <TableCell className="align-top">
                                        <Badge variant="secondary">{REASON_LABELS[entry.reason] ?? entry.reason}</Badge>
                                        {entry.orderId && entry.orderCode ? (
                                            <DetailPageButton href={`/orders/${entry.orderId}`} label={entry.orderCode} className="ml-1 h-auto px-2 py-0" />
                                        ) : null}
                                        {entry.note ? <p className="mt-1 text-sm text-muted-foreground">{entry.note}</p> : null}
                                        {entry.administratorName ? <p className="text-xs text-muted-foreground">by {entry.administratorName}</p> : null}
                                    </TableCell>
                                    <TableCell className={`text-right align-top tabular-nums ${entry.points < 0 ? 'text-destructive' : ''}`}>
                                        {entry.points > 0 ? '+' : ''}
                                        {formatNumber(entry.points)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {history.totalItems > history.items.length ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                            Latest {history.items.length} of {history.totalItems} entries.
                        </p>
                    ) : null}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">No points yet.</p>
            )}

            {hasPermissions(['UpdateCustomer']) ? (
                <form className="space-y-2 border-t pt-4" onSubmit={submit}>
                    <p className="text-sm font-medium">Adjust points</p>
                    <Input
                        type="number"
                        step={1}
                        placeholder="e.g. 500, or -200 to take away"
                        value={points}
                        onChange={e => setPoints(e.target.value)}
                    />
                    <Textarea placeholder="Why (the customer can see this note)" value={note} onChange={e => setNote(e.target.value)} />
                    <Button type="submit" disabled={!canSubmit}>
                        {adjust.isPending ? 'Saving…' : 'Save adjustment'}
                    </Button>
                </form>
            ) : null}
        </div>
    );
}

defineDashboardExtension({
    pageBlocks: [
        {
            id: 'loyalty-points',
            title: 'Loyalty points',
            location: { pageId: 'customer-detail', column: 'main', position: { blockId: 'orders', order: 'after' } },
            requiresPermission: ['ReadCustomer'],
            // Not on the "new customer" form.
            shouldRender: context => !!context.entity?.id,
            component: LoyaltyPoints,
        },
    ],
});
