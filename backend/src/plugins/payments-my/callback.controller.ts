import { Controller, Post, Query, Req, Res } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { Response } from 'express';
import { describeError } from './gateways/http';
import { HostedPaymentService } from './hosted-payment.service';
import { gatewayLabel, HostedGatewayCode, loggerCtx } from './options';
import { RawBodyRequest } from './raw-body.middleware';

/**
 * Server-to-server notifications: POST /payments/chip/callback and /payments/billplz/callback
 * (?method=<paymentMethodCode>). Each purchase or bill is given its URL when it is created, so nothing has
 * to be set up in the gateway dashboards.
 */
@Controller('payments')
export class HostedPaymentCallbackController {
    constructor(private readonly hostedPaymentService: HostedPaymentService) {}

    @Post('chip/callback')
    chip(@Req() req: RawBodyRequest, @Res() res: Response, @Query('method') method?: unknown) {
        return this.handle('chip', req, res, method);
    }

    @Post('billplz/callback')
    billplz(@Req() req: RawBodyRequest, @Res() res: Response, @Query('method') method?: unknown) {
        return this.handle('billplz', req, res, method);
    }

    private async handle(code: HostedGatewayCode, req: RawBodyRequest, res: Response, method: unknown) {
        const rawBody = req.rawBody;
        if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
            res.status(400).send('Empty body');
            return;
        }
        try {
            const result = await this.hostedPaymentService.handleCallback(code, typeof method === 'string' ? method : undefined, rawBody, req.headers, req);
            res.status(result.status).type('text/plain').send(result.message);
        } catch (error) {
            // Logged without the body or headers: they hold customer details, never needed to diagnose this.
            Logger.error(`${gatewayLabel(code)} callback failed: ${describeError(error)}`, loggerCtx);
            res.status(500).type('text/plain').send('Error');
        }
    }
}
