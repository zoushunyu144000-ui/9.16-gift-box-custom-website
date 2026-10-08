import { defineDashboardExtension } from '@vendure/dashboard';

type Line = {
    id: string;
    quantity: number;
    productVariant: { name: string };
    customFields?: { giftMessage?: string | null };
};

const linesWithMessages = (entity: { lines?: Line[] } | undefined) => (entity?.lines ?? []).filter(l => l.customFields?.giftMessage);

/** On every order: the card message for each gift, as it should be printed. */
function GiftMessages({ context }: { context: { entity?: { lines?: Line[] } } }) {
    return (
        <ul className="divide-y">
            {linesWithMessages(context.entity).map(line => (
                <li key={line.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm text-muted-foreground">
                        {line.productVariant.name} · {line.quantity} {line.quantity === 1 ? 'card' : 'cards'}
                    </p>
                    <p className="mt-1 whitespace-pre-line italic">“{line.customFields?.giftMessage}”</p>
                </li>
            ))}
        </ul>
    );
}

defineDashboardExtension({
    pageBlocks: [
        {
            id: 'gift-messages',
            title: 'Gift messages',
            location: { pageId: 'order-detail', column: 'main', position: { blockId: 'order-table', order: 'after' } },
            shouldRender: context => linesWithMessages(context.entity).length > 0,
            component: GiftMessages,
        },
    ],
});
