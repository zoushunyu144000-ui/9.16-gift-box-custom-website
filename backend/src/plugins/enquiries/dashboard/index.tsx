import { graphql } from '@/gql';
import { useQuery } from '@tanstack/react-query';
import { AnyRoute } from '@tanstack/react-router';
import {
    ActionBarItem,
    api,
    Badge,
    Button,
    defineDashboardExtension,
    DetailPageButton,
    detailPageRouteLoader,
    FormFieldWrapper,
    ListPage,
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
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
    Textarea,
    useDetailPage,
    useLocalFormat,
} from '@vendure/dashboard';
import { Inbox, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

// The dashboard is its own TypeScript project, so these few labels mirror ../format.ts (used by the email);
// the details come already worded from the server (Enquiry.detailRows).
const ENQUIRY_STATUSES = ['new', 'in_progress', 'quoted', 'confirmed', 'closed'] as const;
type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];
const STATUS_LABELS: Record<EnquiryStatus, string> = {
    new: 'New',
    in_progress: 'In progress',
    quoted: 'Quoted',
    confirmed: 'Confirmed',
    closed: 'Closed',
};

/** "semi-customised" → "Semi-customised" */
const typeLabel = (type: string) => type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');

const whatsappLink = (phone: string, name: string, code: string) =>
    `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${name.trim().split(/\s+/)[0]}, thank you for your enquiry ${code}.`)}`;

const mailtoLink = (email: string, code: string) => `mailto:${email}?subject=${encodeURIComponent(`Your enquiry ${code}`)}`;

const STATUS_BADGES: Record<EnquiryStatus, 'warning' | 'secondary' | 'default' | 'success' | 'outline'> = {
    new: 'warning',
    in_progress: 'secondary',
    quoted: 'default',
    confirmed: 'success',
    closed: 'outline',
};

function StatusBadge({ status }: { status: string }) {
    const known = status in STATUS_LABELS ? (status as EnquiryStatus) : undefined;
    return <Badge variant={known ? STATUS_BADGES[known] : 'outline'}>{known ? STATUS_LABELS[known] : status}</Badge>;
}

const enquiryListDocument = graphql(`
    query EnquiryList($options: EnquiryListOptions) {
        enquiries(options: $options) {
            items {
                id
                createdAt
                updatedAt
                code
                type
                status
                contact {
                    name
                    company
                    email
                    phone
                }
                totalQuantity
                itemsTotalWithTax
                currencyCode
            }
            totalItems
        }
    }
`);

const enquiryTypesDocument = graphql(`
    query EnquiryTypes {
        enquiryTypes
    }
`);

const enquiryDetailDocument = graphql(`
    query EnquiryDetail($id: ID!) {
        enquiry(id: $id) {
            id
            createdAt
            updatedAt
            code
            type
            status
            contact {
                name
                company
                email
                phone
            }
            items {
                productVariantId
                productName
                variantName
                sku
                quantity
                unitPriceWithTax
            }
            totalQuantity
            itemsTotalWithTax
            currencyCode
            detailRows {
                label
                value
            }
            internalNotes
        }
    }
`);

const updateEnquiryDocument = graphql(`
    mutation UpdateEnquiry($input: UpdateEnquiryInput!) {
        updateEnquiry(input: $input) {
            id
            status
            internalNotes
            updatedAt
        }
    }
`);


function EnquiryListPage({ route }: { route: AnyRoute }) {
    const { formatCurrency, formatDate } = useLocalFormat();
    const { data: types } = useQuery({ queryKey: ['enquiry-types'], queryFn: () => api.query(enquiryTypesDocument) });
    return (
        <ListPage
            pageId="enquiry-list"
            title="Enquiries"
            listQuery={enquiryListDocument}
            route={route}
            defaultSort={[{ id: 'createdAt', desc: true }]}
            // "Received" (createdAt) is always pinned first by the dashboard.
            defaultColumnOrder={['code', 'type', 'contact', 'totalQuantity', 'itemsTotalWithTax', 'status']}
            defaultVisibility={{ id: false, updatedAt: false, currencyCode: false }}
            onSearchTermChange={term => ({
                _or: [
                    { code: { contains: term } },
                    { contactName: { contains: term } },
                    { contactCompany: { contains: term } },
                    { contactEmail: { contains: term } },
                    { contactPhone: { contains: term } },
                ],
            })}
            facetedFilters={{
                status: { title: 'Status', options: ENQUIRY_STATUSES.map(s => ({ label: STATUS_LABELS[s], value: s })) },
                type: { title: 'Type', options: (types?.enquiryTypes ?? []).map(t => ({ label: typeLabel(t), value: t })) },
            }}
            customizeColumns={{
                code: {
                    header: 'Reference',
                    cell: ({ row }) => <DetailPageButton id={row.original.id} label={row.original.code} />,
                },
                createdAt: {
                    header: 'Received',
                    cell: ({ row }) =>
                        formatDate(row.original.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
                },
                type: {
                    header: 'Type',
                    cell: ({ row }) => typeLabel(row.original.type),
                },
                contact: {
                    header: 'Contact',
                    cell: ({ row }) => (
                        <div className="leading-tight">
                            <div>{row.original.contact.name}</div>
                            <div className="text-xs text-muted-foreground">{row.original.contact.company || row.original.contact.email}</div>
                        </div>
                    ),
                },
                totalQuantity: { header: 'Gifts' },
                itemsTotalWithTax: {
                    header: 'Indicative value',
                    meta: { dependencies: ['currencyCode'] },
                    cell: ({ row }) =>
                        row.original.totalQuantity ? formatCurrency(row.original.itemsTotalWithTax, row.original.currencyCode) : '—',
                },
                status: {
                    header: 'Status',
                    cell: ({ row }) => <StatusBadge status={row.original.status} />,
                },
            }}
        />
    );
}

function EnquiryDetailPage({ route }: { route: AnyRoute }) {
    const params = route.useParams();
    const { formatCurrency, formatDate } = useLocalFormat();
    const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
        pageId: 'enquiry-detail',
        queryDocument: enquiryDetailDocument,
        updateDocument: updateEnquiryDocument,
        setValuesForUpdate: enquiry => ({ id: enquiry.id, status: enquiry.status, internalNotes: enquiry.internalNotes ?? '' }),
        params: { id: params.id },
        onSuccess: () => {
            toast.success('Enquiry saved');
            resetForm();
        },
        onError: err => {
            toast.error('The enquiry was not saved', {
                description: (err instanceof Error ? err.message : String(err)).replace(/^GraphQL Request Error:\s*/, ''),
            });
        },
    });
    if (!entity) return null;
    const money = (sen: number) => formatCurrency(sen, entity.currencyCode);
    const details = entity.detailRows;
    const { contact } = entity;

    return (
        <Page pageId="enquiry-detail" form={form} submitHandler={submitHandler} entity={entity}>
            <PageTitle>
                {entity.code} · {typeLabel(entity.type)}
            </PageTitle>
            <PageActionBar>
                <ActionBarItem itemId="save-button" requiresPermission={['UpdateEnquiry']}>
                    <Button type="submit" disabled={!form.formState.isDirty || isPending}>
                        Save
                    </Button>
                </ActionBarItem>
            </PageActionBar>
            <PageLayout>
                {/* Fully customised requests usually come without a list of gifts. */}
                {entity.items.length > 0 && (
                    <PageBlock column="main" blockId="enquiry-items" title="Gifts chosen" description="At the prices when the enquiry was sent, before customisation and delivery.">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-16">Qty</TableHead>
                                    <TableHead>Gift</TableHead>
                                    <TableHead className="text-right">Each</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {entity.items.map(item => (
                                    <TableRow key={item.productVariantId}>
                                        <TableCell className="tabular-nums">{item.quantity}</TableCell>
                                        <TableCell>
                                            <div>{item.variantName && item.variantName !== item.productName ? `${item.productName} – ${item.variantName}` : item.productName}</div>
                                            <DetailPageButton className="h-auto px-0 text-xs text-muted-foreground" href={`/product-variants/${item.productVariantId}`} label={item.sku} />
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{money(item.unitPriceWithTax)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{money(item.unitPriceWithTax * item.quantity)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell className="tabular-nums">{entity.totalQuantity}</TableCell>
                                    <TableCell>Indicative value</TableCell>
                                    <TableCell />
                                    <TableCell className="text-right tabular-nums">{money(entity.itemsTotalWithTax)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </PageBlock>
                )}
                <PageBlock column="main" blockId="enquiry-details" title="Details">
                    {details.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No other details were given.</p>
                    ) : (
                        <dl className="grid grid-cols-[minmax(8rem,14rem)_1fr] gap-x-4 gap-y-2 text-sm">
                            {details.map(row => (
                                <div key={row.label} className="contents">
                                    <dt className="text-muted-foreground">{row.label}</dt>
                                    <dd className="whitespace-pre-line">{row.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </PageBlock>
                <PageBlock column="side" blockId="enquiry-status" title="Status">
                    <div className="space-y-4">
                        <FormFieldWrapper
                            control={form.control}
                            name="status"
                            label="Status"
                            renderFormControl={false}
                            render={({ field }) => (
                                <Select items={STATUS_LABELS} value={field.value} onValueChange={value => value && field.onChange(value)}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ENQUIRY_STATUSES.map(status => (
                                            <SelectItem key={status} value={status}>
                                                {STATUS_LABELS[status]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                        <FormFieldWrapper
                            control={form.control}
                            name="internalNotes"
                            label="Internal notes"
                            description="Only staff see these, e.g. what was quoted and when."
                            render={({ field }) => <Textarea {...field} value={field.value ?? ''} rows={6} />}
                        />
                        <p className="text-xs text-muted-foreground">
                            Received {formatDate(entity.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                            {entity.updatedAt !== entity.createdAt && <> · updated {formatDate(entity.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</>}
                        </p>
                    </div>
                </PageBlock>
                <PageBlock column="side" blockId="enquiry-contact" title="Contact">
                    <div className="space-y-3 text-sm">
                        <div>
                            <div className="font-medium">{contact.name}</div>
                            {contact.company && <div className="text-muted-foreground">{contact.company}</div>}
                        </div>
                        <div>
                            <a className="underline-offset-4 hover:underline" href={mailtoLink(contact.email, entity.code)}>
                                {contact.email}
                            </a>
                            <br />
                            <a className="underline-offset-4 hover:underline" href={`tel:${contact.phone}`}>
                                {contact.phone}
                            </a>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" render={<a href={whatsappLink(contact.phone, contact.name, entity.code)} target="_blank" rel="noopener noreferrer" />}>
                                <MessageCircle className="mr-1 h-4 w-4" />
                                WhatsApp
                            </Button>
                            <Button variant="outline" size="sm" render={<a href={mailtoLink(contact.email, entity.code)} />}>
                                <Mail className="mr-1 h-4 w-4" />
                                Email
                            </Button>
                        </div>
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

defineDashboardExtension({
    routes: [
        {
            path: '/enquiries',
            loader: () => ({ breadcrumb: 'Enquiries' }),
            navMenuItem: {
                sectionId: 'sales',
                id: 'enquiries',
                title: 'Enquiries',
                icon: Inbox,
                order: 200,
                requiresPermission: ['ReadEnquiry'],
            },
            component: route => <EnquiryListPage route={route} />,
        },
        {
            path: '/enquiries/$id',
            loader: detailPageRouteLoader({
                pageId: 'enquiry-detail',
                queryDocument: enquiryDetailDocument,
                breadcrumb: (_isNew, entity) => [{ path: '/enquiries', label: 'Enquiries' }, entity?.code],
            }),
            component: route => <EnquiryDetailPage route={route} />,
        },
    ],
});
