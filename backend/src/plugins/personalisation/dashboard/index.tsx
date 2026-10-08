import { defineDashboardExtension } from '@vendure/dashboard';

type Line = {
    id: string;
    quantity: number;
    productVariant: { name: string; sku: string };
    customFields?: { names?: string | null; namesFor?: string | null };
};

const linesWithNames = (entity: { lines?: Line[] } | undefined) => (entity?.lines ?? []).filter(l => l.customFields?.names);

/** On every order: which names go on which gift, laid out for packing. */
function NamesForPacking({ context }: { context: { entity?: { lines?: Line[] } } }) {
    const lines = context.entity?.lines ?? [];
    const giftName = (sku?: string | null) => lines.find(l => l.productVariant.sku === sku)?.productVariant.name ?? sku ?? '—';
    return (
        <ul className="divide-y">
            {linesWithNames(context.entity).map(line => (
                <li key={line.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm text-muted-foreground">
                        For <span className="font-medium text-foreground">{giftName(line.customFields?.namesFor)}</span> ·{' '}
                        {line.quantity} {line.quantity === 1 ? 'name' : 'names'}
                    </p>
                    <p className="mt-1 whitespace-pre-line font-mono text-base tracking-wide">{line.customFields?.names}</p>
                </li>
            ))}
        </ul>
    );
}

defineDashboardExtension({
    pageBlocks: [
        {
            id: 'personalised-names',
            title: 'Personalised names',
            location: { pageId: 'order-detail', column: 'main', position: { blockId: 'order-table', order: 'after' } },
            shouldRender: context => linesWithNames(context.entity).length > 0,
            component: NamesForPacking,
        },
    ],
});
