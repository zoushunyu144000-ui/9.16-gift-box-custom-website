import { BadGatewayException, BadRequestException, Controller, Get, HttpException, Inject, Param, Post, Query, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import { Allow, Ctx, Logger, Permission, RequestContext } from '@vendure/core';
import type { Request, Response } from 'express';
import { ProviderError } from '../clients/http';
import { COURIERS_OPTIONS, LALAMOVE_WEBHOOK_PATH, loggerCtx } from '../constants';
import { easyParcelRateProvider } from '../easyparcel-rate-provider';
import { ResolvedCouriersOptions } from '../options';
import { CourierBookingService } from '../services/courier-booking.service';
import { EasyParcelAuthService, OAuthStateError } from '../services/easyparcel-auth.service';
import { ShipmentSyncService } from '../services/shipment-sync.service';
import { NotConnectedError } from '../token-manager';

/** Provider and setup problems become HTTP errors whose message staff can read (Vendure hides other errors). */
async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
        return await work();
    } catch (error) {
        if (error instanceof HttpException) throw error;
        if (error instanceof NotConnectedError) throw new ServiceUnavailableException(error.message);
        if (error instanceof ProviderError) throw new BadGatewayException(error.message);
        throw new BadRequestException((error as Error).message);
    }
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function page(res: Response, status: number, title: string, message: string, dashboardUrl: string) {
    res.status(status)
        .type('html')
        .send(
            `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>` +
                `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">` +
                `<h1 style="font-size:1.25rem">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>` +
                `<p><a href="${escapeHtml(dashboardUrl)}">Back to the dashboard</a></p></body></html>`,
        );
}

const wantsJson = (req: Request) => req.query.format === 'json' || (req.headers.accept ?? '').includes('application/json');

/**
 * Admin-only setup routes. Open them in the browser while signed in to the dashboard (same session
 * cookie), or call them with the Admin API bearer token. `?vendure-token=<channel token>` picks a channel.
 */
@Controller('delivery')
export class CourierAdminController {
    constructor(
        private easyParcelAuth: EasyParcelAuthService,
        private booking: CourierBookingService,
        private sync: ShipmentSyncService,
        @Inject(COURIERS_OPTIONS) private options: ResolvedCouriersOptions,
    ) {}

    /** Starts connecting the merchant's EasyParcel account: redirects to EasyParcel's authorise page. */
    @Get('easyparcel/connect')
    @Allow(Permission.UpdateSettings)
    connect(@Ctx() ctx: RequestContext, @Req() req: Request, @Res() res: Response): void {
        if (!this.easyParcelAuth.configured) {
            res.status(503).json({ message: 'Set EASYPARCEL_CLIENT_ID and EASYPARCEL_CLIENT_SECRET first.' });
            return;
        }
        const url = this.easyParcelAuth.authorizeUrl(ctx);
        if (wantsJson(req)) res.json({ url, redirectUri: this.easyParcelAuth.redirectUri() });
        else res.redirect(302, url);
    }

    /** EasyParcel sends the merchant back here with a code; the tokens are stored for the channel. */
    @Get('easyparcel/oauth/callback')
    @Allow(Permission.UpdateSettings)
    async callback(
        @Ctx() ctx: RequestContext,
        @Query('code') code: string | undefined,
        @Query('state') state: string | undefined,
        @Query('error') error: string | undefined,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const dashboard = `${this.options.publicUrl}/dashboard`;
        const reply = (status: number, title: string, message: string) =>
            wantsJson(req) ? res.status(status).json({ connected: status === 200, message }) : page(res, status, title, message, dashboard);
        if (error || !code || !state) {
            reply(400, 'EasyParcel not connected', error ? `EasyParcel did not authorise the connection (${error}).` : 'The authorisation code is missing.');
            return;
        }
        try {
            const { channelId } = await this.easyParcelAuth.completeAuthorization(ctx, code, state);
            reply(200, 'EasyParcel connected', `The EasyParcel account is connected (channel ${channelId}). Rates and bookings now use it.`);
        } catch (e) {
            const message = e instanceof OAuthStateError || e instanceof ProviderError ? e.message : 'The connection could not be completed.';
            if (!(e instanceof OAuthStateError)) Logger.warn(`EasyParcel connection failed: ${(e as Error).message}`, loggerCtx);
            reply(400, 'EasyParcel not connected', message);
        }
    }

    /** Connection state, plus the redirect URI and webhook URL to enter in the EasyParcel Developer Hub. */
    @Get('easyparcel/status')
    @Allow(Permission.UpdateSettings)
    easyParcelStatus(@Ctx() ctx: RequestContext) {
        return this.easyParcelAuth.status(ctx);
    }

    @Post('easyparcel/disconnect')
    @Allow(Permission.UpdateSettings)
    async disconnect(@Ctx() ctx: RequestContext) {
        return { disconnected: await this.easyParcelAuth.disconnect(ctx) };
    }

    /**
     * The live rates checkout would get for a parcel (through the same `easyParcelRateProvider` delivery-my
     * calls), e.g. ?toPostcode=11950&toState=Penang&weightKg=2. An empty list means no rates (not connected,
     * unknown state, or EasyParcel unavailable).
     */
    @Get('easyparcel/rates')
    @Allow(Permission.ReadSettings)
    rates(@Ctx() ctx: RequestContext, @Query() query: Record<string, string | undefined>) {
        const number = (value?: string) => (value && Number.isFinite(Number(value)) ? Number(value) : undefined);
        return easyParcelRateProvider.getRates(ctx, {
            fromPostcode: query.fromPostcode || this.options.origin.postcode,
            toPostcode: query.toPostcode ?? '',
            toState: query.toState,
            weightKg: number(query.weightKg) ?? this.options.defaultParcel.weightKg,
            lengthCm: number(query.lengthCm),
            widthCm: number(query.widthCm),
            heightCm: number(query.heightCm),
        });
    }

    /** Lalamove's service types per city for the market (the values for the handler's Vehicle field). */
    @Get('lalamove/service-types')
    @Allow(Permission.ReadSettings)
    serviceTypes() {
        return run(async () => {
            const cities = await this.booking.lalamove().getCities();
            return cities.map(city => ({ locode: city.locode, name: city.name, serviceTypes: (city.services ?? []).map(s => s.key) }));
        });
    }

    /** Points Lalamove's webhook at this server (instead of setting it in the Partner Portal). */
    @Post('lalamove/register-webhook')
    @Allow(Permission.UpdateSettings)
    registerLalamoveWebhook() {
        return run(async () => {
            const url = `${this.options.publicUrl}${LALAMOVE_WEBHOOK_PATH}`;
            await this.booking.lalamove().setWebhookUrl(url);
            return { url };
        });
    }

    /** Re-checks one shipment with its courier now. */
    @Post('shipments/:fulfillmentId/refresh')
    @Allow(Permission.UpdateOrder)
    refresh(@Ctx() ctx: RequestContext, @Param('fulfillmentId') fulfillmentId: string) {
        return run(() => this.sync.refreshFulfillment(ctx, fulfillmentId));
    }

    /** Runs the reconcile task now, in this process. */
    @Post('shipments/reconcile')
    @Allow(Permission.UpdateOrder)
    reconcile() {
        return run(() => this.sync.reconcile());
    }
}
