import { INestApplicationContext } from '@nestjs/common';
import { Channel, ChannelService, isGraphQlErrorResult, RequestContext } from '@vendure/core';
import { normaliseStorefrontContent, StorefrontContent } from './content';

/**
 * Writes a shop's storefront texts and contact details to its default channel, e.g. from the store setup:
 *
 * ```ts
 * await setupStorefrontContent(app, ctx, {
 *     heroTitle: 'More than a gift / A memory',
 *     whatsappNumber: '601128691092',
 *     showPreviewNotice: true,
 * });
 * ```
 *
 * Only the fields given are changed. Text is trimmed and empty text clears a field. Throws, naming each
 * problem, if a value would be refused in the dashboard (too long, not a phone number, unknown field…).
 */
export async function setupStorefrontContent(
    app: INestApplicationContext,
    ctx: RequestContext,
    content: Partial<StorefrontContent>,
): Promise<Channel> {
    const { content: values, problems } = normaliseStorefrontContent(content as Record<string, unknown>);
    if (problems.length) {
        throw new Error(`Storefront content was not saved:\n  ${problems.join('\n  ')}`);
    }
    const channelService = app.get(ChannelService);
    const channel = await channelService.getDefaultChannel(ctx);
    // Custom fields are merged into the channel's, so fields not given keep their values.
    const result = await channelService.update(ctx, { id: channel.id, customFields: values });
    if (isGraphQlErrorResult(result)) {
        throw new Error(`Storefront content was not saved: ${result.message}`);
    }
    return result;
}
