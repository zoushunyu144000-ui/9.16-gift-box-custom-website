import { Controller, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { Logger } from '@vendure/core';
import type { Request, Response } from 'express';
import { parseEasyParcelWebhook } from '../clients/easyparcel-webhook';
import { verifyLalamoveWebhook } from '../clients/lalamove-webhook';
import { COURIERS_OPTIONS, LALAMOVE_WEBHOOK_PATH, loggerCtx } from '../constants';
import { safeEqual } from '../crypto';
import { ResolvedCouriersOptions } from '../options';
import { ShipmentSyncService } from '../services/shipment-sync.service';

type WebhookRequest = Request & { rawBody?: Buffer };

/**
 * Courier webhooks. Each one is verified, deduplicated and queued for the worker, then answered with
 * 200 straight away: Lalamove disables a webhook URL after 10 failed deliveries in 24 hours.
 */
@Controller('delivery')
export class CourierWebhookController {
    constructor(
        private sync: ShipmentSyncService,
        @Inject(COURIERS_OPTIONS) private options: ResolvedCouriersOptions,
    ) {}

    /** Signed: HMAC over the timestamp, this URL's path and the event data (webhook spec v1.5). */
    @Post('lalamove/webhook')
    async lalamove(@Req() req: WebhookRequest, @Res() res: Response): Promise<void> {
        const { apiKey, apiSecret } = this.options.lalamove;
        const result = verifyLalamoveWebhook(rawText(req), { apiKey, apiSecret, paths: this.lalamovePaths(req) });
        if (result.kind === 'rejected') {
            Logger.warn(`Rejected a Lalamove webhook: ${result.reason}`, loggerCtx);
            res.status(401).json({ ok: false });
            return;
        }
        if (result.kind === 'expired') Logger.warn(`Ignored a Lalamove webhook: ${result.reason} (check the server clock if this repeats)`, loggerCtx);
        // Wallet events and the URL check carry no order.
        if (result.kind === 'event' && result.event.orderId && !(await this.sync.isProcessed(result.event.eventKey))) {
            await this.sync.enqueueLalamove(result.event);
        }
        res.status(200).json({ ok: true });
    }

    /**
     * EasyParcel signs nothing, so the URL carries a secret and the payload is never trusted: it only
     * names the shipment, which the worker re-fetches from the EasyParcel API.
     */
    @Post('easyparcel/webhook/:secret')
    async easyParcel(@Param('secret') secret: string, @Req() req: WebhookRequest, @Res() res: Response): Promise<void> {
        const expected = this.options.easyParcel.webhookSecret;
        if (!expected || !safeEqual(secret ?? '', expected)) {
            res.status(404).json({ ok: false });
            return;
        }
        const event = parseEasyParcelWebhook(rawText(req));
        if (event && !event.topic.startsWith('ondemand.') && !(await this.sync.isProcessed(event.eventKey))) {
            await this.sync.enqueueEasyParcel(event);
        }
        res.status(200).json({ ok: true });
    }

    /** The path Lalamove signed: as configured publicly (behind any proxy prefix) and as received. */
    private lalamovePaths(req: Request): string[] {
        const publicPath = new URL(this.options.publicUrl).pathname.replace(/\/+$/, '');
        return [`${publicPath}${LALAMOVE_WEBHOOK_PATH}`, (req.originalUrl ?? req.url).split('?')[0]];
    }
}

function rawText(req: WebhookRequest): string {
    if (req.rawBody) return req.rawBody.toString('utf8');
    // Only if the raw-body middleware was bypassed: verification then relies on re-serialised data.
    Logger.warn('Webhook arrived without its raw body; check the couriers-my middleware routes.', loggerCtx);
    return req.body && typeof req.body === 'object' ? JSON.stringify(req.body) : '';
}
