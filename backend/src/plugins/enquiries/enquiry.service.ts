import { Inject, Injectable } from '@nestjs/common';
import {
    CurrencyCode,
    EntityNotFoundError,
    EventBus,
    ID,
    idsAreEqual,
    ListQueryBuilder,
    ListQueryOptions,
    Logger,
    PaginatedList,
    ProductPriceApplicator,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    TranslatorService,
    UserInputError,
} from '@vendure/core';
import { In, IsNull } from 'typeorm';
import { generateEnquiryCode, uniqueEnquiryCode } from './code';
import { ENQUIRIES_PLUGIN_OPTIONS, ENQUIRY_STATUSES, EnquiriesOptions, EnquiryStatus, loggerCtx } from './constants';
import { Enquiry, EnquiryItemSnapshot } from './enquiry.entity';
import { EnquirySubmittedEvent } from './enquiry-submitted.event';
import { RateLimiter } from './rate-limiter';
import { EnquiryError, SubmitEnquiryResult } from './results';
import { checkEnquiry, EnquiryInput, todayInKualaLumpur } from './validation';

export interface UpdateEnquiryInput {
    id: ID;
    status?: EnquiryStatus | null;
    internalNotes?: string | null;
}

const INTERNAL_NOTES_MAX = 10000;

/** Ids the default (auto-increment) id strategy can hold; anything else can't be a real gift. */
const isPlausibleId = (id: ID) => (typeof id === 'number' ? Number.isSafeInteger(id) && id > 0 && id <= 2147483647 : id.length > 0 && id.length <= 64);

@Injectable()
export class EnquiryService {
    private limiter: RateLimiter | undefined;

    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private eventBus: EventBus,
        private productPriceApplicator: ProductPriceApplicator,
        private translator: TranslatorService,
        @Inject(ENQUIRIES_PLUGIN_OPTIONS) private options: EnquiriesOptions,
    ) {
        const { rateLimit } = options;
        this.limiter = rateLimit ? new RateLimiter(rateLimit.limit, rateLimit.windowMinutes * 60_000) : undefined;
    }

    async submit(ctx: RequestContext, input: EnquiryInput): Promise<SubmitEnquiryResult> {
        const check = checkEnquiry(input, { today: todayInKualaLumpur(), types: this.options.types });
        if (!check.ok) return new EnquiryError('ENQUIRY_INPUT_ERROR', check.message);
        const { enquiry: clean } = check;
        const address = ctx.req?.ip ?? 'unknown';

        if (clean.honeypot) {
            // Answer as if it worked so the bot learns nothing, but save and send nothing.
            this.limiter?.tryHit(address);
            Logger.info(`Ignored an enquiry from ${address}: the hidden "website" field was filled in`, loggerCtx);
            return { __typename: 'EnquiryReceipt', code: generateEnquiryCode(this.options.codePrefix) };
        }

        const items = await this.snapshotItems(ctx, clean.items);
        if (!items) {
            return new EnquiryError(
                'ENQUIRY_ITEM_UNAVAILABLE_ERROR',
                'One of the gifts you chose is no longer available. Please refresh the page and choose again.',
            );
        }

        if (this.limiter && !this.limiter.tryHit(address)) {
            const minutes = Math.max(1, Math.ceil(this.limiter.retryAfterSeconds(address) / 60));
            Logger.warn(`Refused an enquiry from ${address}: ${this.limiter.limit} already sent within the time window`, loggerCtx);
            return new EnquiryError(
                'ENQUIRY_RATE_LIMIT_ERROR',
                `You’ve sent several requests in a short time. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}, or message us on WhatsApp.`,
            );
        }

        const repository = this.connection.getRepository(ctx, Enquiry);
        const code = await uniqueEnquiryCode(this.options.codePrefix, async candidate => (await repository.count({ where: { code: candidate } })) > 0);
        const enquiry = await repository.save(
            new Enquiry({
                code,
                type: clean.type,
                status: 'new',
                contactName: clean.contact.name,
                contactCompany: clean.contact.company,
                contactEmail: clean.contact.email,
                contactPhone: clean.contact.phone,
                items: items.snapshots,
                totalQuantity: items.snapshots.reduce((sum, item) => sum + item.quantity, 0),
                itemsTotalWithTax: items.snapshots.reduce((sum, item) => sum + item.quantity * item.unitPriceWithTax, 0),
                currencyCode: items.currencyCode,
                details: clean.details,
                internalNotes: null,
                channelId: ctx.channelId,
            }),
        );
        await this.eventBus.publish(new EnquirySubmittedEvent(ctx, enquiry));
        return { __typename: 'EnquiryReceipt', code };
    }

    findAll(ctx: RequestContext, options?: ListQueryOptions<Enquiry>): Promise<PaginatedList<Enquiry>> {
        return this.listQueryBuilder
            .build(Enquiry, options, {
                ctx,
                where: { channelId: ctx.channelId },
                // Newest first unless the caller asks for another order.
                ...(options?.sort ? {} : { orderBy: { createdAt: 'DESC' } }),
            })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    async findOne(ctx: RequestContext, id: ID): Promise<Enquiry | null> {
        if (!isPlausibleId(id)) return null;
        return this.connection.getRepository(ctx, Enquiry).findOne({ where: { id, channelId: ctx.channelId } });
    }

    /** The enquiry types received so far, for the dashboard's filter. */
    async types(ctx: RequestContext): Promise<string[]> {
        const rows: Array<{ type: string }> = await this.connection
            .getRepository(ctx, Enquiry)
            .createQueryBuilder('enquiry')
            .select('DISTINCT enquiry.type', 'type')
            .where('enquiry.channelId = :channelId', { channelId: ctx.channelId })
            .getRawMany();
        return rows.map(row => row.type).sort();
    }

    async update(ctx: RequestContext, input: UpdateEnquiryInput): Promise<Enquiry> {
        const enquiry = await this.findOne(ctx, input.id);
        if (!enquiry) throw new EntityNotFoundError('Enquiry', input.id);
        if (input.status != null) {
            if (!ENQUIRY_STATUSES.includes(input.status)) throw new UserInputError(`Unknown enquiry status "${String(input.status)}"`);
            enquiry.status = input.status;
        }
        if (input.internalNotes !== undefined) {
            const notes = input.internalNotes?.trim() ?? '';
            if (notes.length > INTERNAL_NOTES_MAX) {
                throw new UserInputError(`Internal notes are limited to ${INTERNAL_NOTES_MAX.toLocaleString('en')} characters`);
            }
            enquiry.internalNotes = notes || null;
        }
        return this.connection.getRepository(ctx, Enquiry).save(enquiry);
    }

    /**
     * The chosen gifts with their names and current prices, or undefined when one is unknown, deleted,
     * disabled or not sold in this channel.
     */
    private async snapshotItems(
        ctx: RequestContext,
        items: Array<{ productVariantId: ID; quantity: number }>,
    ): Promise<{ snapshots: EnquiryItemSnapshot[]; currencyCode: CurrencyCode } | undefined> {
        const currencyCode = ctx.channel.defaultCurrencyCode;
        if (!items.length) return { snapshots: [], currencyCode };
        if (!items.every(item => isPlausibleId(item.productVariantId))) return;
        const variants = await this.connection.getRepository(ctx, ProductVariant).find({
            where: {
                id: In(items.map(item => item.productVariantId)),
                enabled: true,
                deletedAt: IsNull(),
                channels: { id: ctx.channelId },
                product: { enabled: true, deletedAt: IsNull() },
            },
            relations: { product: true, taxCategory: true },
        });
        const snapshots: EnquiryItemSnapshot[] = [];
        for (const item of items) {
            const variant = variants.find(v => idsAreEqual(v.id, item.productVariantId));
            if (!variant) return;
            await this.productPriceApplicator.applyChannelPriceAndTax(variant, ctx);
            const translated = this.translator.translate(variant, ctx, ['product']);
            snapshots.push({
                productVariantId: variant.id,
                productName: translated.product.name,
                variantName: translated.name,
                sku: variant.sku,
                quantity: item.quantity,
                unitPriceWithTax: variant.priceWithTax,
            });
        }
        return { snapshots, currencyCode: variants[0].currencyCode ?? currencyCode };
    }
}
