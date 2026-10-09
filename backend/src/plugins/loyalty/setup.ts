import { INestApplication } from '@nestjs/common';
import { isGraphQlErrorResult, LanguageCode, Promotion, PromotionService, RequestContext, TransactionalConnection } from '@vendure/core';
import { LOYALTY_ACTION_CODE, LOYALTY_CONDITION_CODE } from './promotion';

const NAME = 'Loyalty points';
const DESCRIPTION = 'Points the customer uses at checkout, taken off the price of the items.';

/**
 * Creates the "Loyalty points" promotion that applies the points discount, in the context's channel.
 * Idempotent: if the channel already has a promotion with the loyalty action it is returned unchanged,
 * also when staff have disabled it on purpose. Call it from the store setup script after the channel exists.
 */
export async function setupLoyalty(app: INestApplication, ctx: RequestContext): Promise<Promotion> {
    const existing = await app
        .get(TransactionalConnection)
        .getRepository(ctx, Promotion)
        .createQueryBuilder('promotion')
        .innerJoin('promotion.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
        .where('promotion.deletedAt IS NULL')
        .getMany();
    const found = existing.find(p => p.actions.some(a => a.code === LOYALTY_ACTION_CODE));
    if (found) return found;

    const languages = Array.from(new Set([LanguageCode.en, ctx.channel.defaultLanguageCode]));
    const result = await app.get(PromotionService).createPromotion(ctx, {
        enabled: true,
        conditions: [{ code: LOYALTY_CONDITION_CODE, arguments: [] }],
        actions: [{ code: LOYALTY_ACTION_CODE, arguments: [] }],
        translations: languages.map(languageCode => ({ languageCode, name: NAME, description: DESCRIPTION })),
    });
    if (isGraphQlErrorResult(result)) throw new Error(`Could not create the loyalty points promotion: ${result.message}`);
    return result;
}
