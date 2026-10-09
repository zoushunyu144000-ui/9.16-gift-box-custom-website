import { graphql } from '@/gql';
import { useQuery } from '@tanstack/react-query';
import {
    ActionBarItem,
    api,
    Button,
    CustomFormComponent,
    DashboardFormComponent,
    defineDashboardExtension,
    DetailFormGrid,
    FormFieldWrapper,
    Input,
    Page,
    PageActionBar,
    PageBlock,
    PageLayout,
    PageTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Skeleton,
    useChannel,
    useCustomFieldConfig,
    useDetailPage,
} from '@vendure/dashboard';
import { Store } from 'lucide-react';
import { Suspense } from 'react';
import { toast } from 'sonner';
import { STOREFRONT_FIELDS } from '../content';

const NONE = '__none__';

const collectionsDocument = graphql(`
    query StorefrontCollections($options: CollectionListOptions) {
        collections(options: $options) {
            items {
                id
                name
                slug
            }
        }
    }
`);

/** Featured collection: choose from the shop's collections instead of typing a slug. */
const CollectionSlugInput: DashboardFormComponent = ({ value, onChange, disabled }) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['storefront-content', 'collections'],
        queryFn: () => api.query(collectionsDocument, { options: { take: 500, sort: { name: 'ASC' } } }),
    });
    // Staff who can't list collections can still type the slug.
    if (isError) {
        return <Input value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder="e.g. chinese-new-year" />;
    }
    const items: Record<string, string> = { [NONE]: 'None' };
    for (const c of data?.collections.items ?? []) items[c.slug] = c.name;
    if (value && !items[value]) items[value] = `${value} (collection not found)`;
    return (
        <Select items={items} value={value || NONE} onValueChange={v => onChange(!v || v === NONE ? null : v)} disabled={disabled || isLoading}>
            <SelectTrigger className="w-full">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {Object.entries(items).map(([slug, name]) => (
                    <SelectItem key={slug} value={slug}>
                        {name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

const channelDocument = graphql(`
    query StorefrontContentChannel($id: ID!) {
        channel(id: $id) {
            id
            code
            customFields {
                heroEyebrow
                heroTitle
                heroText
                featuredCollectionSlug
                featuredTitle
                featuredIntro
                whatsappNumber
                contactEmail
                businessHours
                showPreviewNotice
            }
        }
    }
`);

const updateChannelDocument = graphql(`
    mutation UpdateStorefrontContent($input: UpdateChannelInput!) {
        updateChannel(input: $input) {
            __typename
            ... on Channel {
                id
            }
            ... on ErrorResult {
                errorCode
                message
            }
        }
    }
`);

const SECTION_INTROS: Record<string, string> = {
    'Homepage banner': 'The large banner at the top of the homepage.',
    'Featured collection': 'The gifts that lead the homepage, such as the festival in season.',
    Contact: 'How customers reach the shop: the WhatsApp buttons, the footer and order confirmations.',
    Notices: 'Messages shown across the website.',
};

type LocalizedText = string | Array<{ languageCode: string; value: string }> | null | undefined;
const text = (value: LocalizedText) => (typeof value === 'string' ? value : (value?.find(t => t.languageCode === 'en') ?? value?.[0])?.value);

/** Settings → Storefront: the texts and contact details of the channel selected in the dashboard. */
function StorefrontPage() {
    const { activeChannel } = useChannel();
    if (!activeChannel) return null;
    // A new form for each channel, so switching channels never saves one shop's texts to another.
    return (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <StorefrontForm key={activeChannel.id} channelId={activeChannel.id} />
        </Suspense>
    );
}

function StorefrontForm({ channelId }: { channelId: string }) {
    const fieldConfig = useCustomFieldConfig('Channel').filter(f => (STOREFRONT_FIELDS as string[]).includes(f.name));
    const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
        pageId: 'storefront-content',
        queryDocument: channelDocument,
        updateDocument: updateChannelDocument,
        params: { id: channelId },
        setValuesForUpdate: channel => ({ id: channel.id, customFields: channel.customFields }),
        onSuccess: result => {
            if (result && 'message' in result) {
                toast.error('The storefront texts were not saved', { description: String(result.message) });
                return;
            }
            toast.success('Saved. The website shows the new texts straight away.');
            resetForm();
        },
        onError: err => {
            toast.error('The storefront texts were not saved', { description: err instanceof Error ? err.message : String(err) });
        },
    });

    const sections = new Map<string, typeof fieldConfig>();
    for (const field of fieldConfig) {
        const tab = (field.ui as { tab?: string } | null)?.tab ?? 'Storefront';
        sections.set(tab, [...(sections.get(tab) ?? []), field]);
    }

    return (
        <Page pageId="storefront-content" form={form} submitHandler={submitHandler} entity={entity}>
            <PageTitle>Storefront</PageTitle>
            <PageActionBar>
                <ActionBarItem itemId="save-button" requiresPermission={['UpdateChannel']}>
                    <Button type="submit" disabled={!form.formState.isDirty || isPending}>
                        Save
                    </Button>
                </ActionBarItem>
            </PageActionBar>
            <PageLayout>
                {[...sections].map(([tab, fields]) => (
                    <PageBlock key={tab} column="main" blockId={`storefront-${tab.toLowerCase().replace(/\W+/g, '-')}`} title={tab} description={SECTION_INTROS[tab]}>
                        <DetailFormGrid>
                            {fields.map(field => (
                                <FormFieldWrapper
                                    key={field.name}
                                    control={form.control}
                                    name={`customFields.${field.name}`}
                                    label={text(field.label) ?? field.name}
                                    description={text(field.description)}
                                    renderFormControl={!field.ui?.component}
                                    render={({ field: input }) => <CustomFormComponent fieldDef={field} {...input} />}
                                />
                            ))}
                        </DetailFormGrid>
                    </PageBlock>
                ))}
            </PageLayout>
        </Page>
    );
}

defineDashboardExtension({
    customFormComponents: {
        customFields: [{ id: 'storefront-collection-slug-input', component: CollectionSlugInput }],
    },
    routes: [
        {
            path: '/storefront',
            loader: () => ({ breadcrumb: 'Storefront' }),
            navMenuItem: {
                sectionId: 'settings',
                id: 'storefront',
                title: 'Storefront',
                icon: Store,
                // First in Settings: the page shop staff use most.
                order: 50,
                requiresPermission: ['UpdateChannel'],
            },
            component: () => <StorefrontPage />,
        },
    ],
});
