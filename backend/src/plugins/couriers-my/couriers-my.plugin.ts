import { OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Injector, Logger, PluginCommonModule, ProcessContext, RuntimeVendureConfig, VendurePlugin } from '@vendure/core';
import { EmailEventHandler, EmailPlugin } from '@vendure/email-plugin';
import { CourierAdminController } from './api/admin.controller';
import { rawBodyMiddleware } from './api/raw-body.middleware';
import { CourierWebhookController } from './api/webhook.controller';
import { COURIERS_OPTIONS, EASYPARCEL_WEBHOOK_PATH, LALAMOVE_WEBHOOK_PATH, loggerCtx } from './constants';
import { fulfillmentCustomFields } from './custom-fields';
import { shipmentEmailHandlers } from './email-handlers';
import { EasyParcelRateService } from './easyparcel-rate-provider';
import { CourierGeocode } from './entities/courier-geocode.entity';
import { CourierShipmentEvent } from './entities/courier-shipment-event.entity';
import { EasyParcelConnection } from './entities/easyparcel-connection.entity';
import { createEasyParcelHandler } from './handlers/easyparcel.handler';
import { createLalamoveHandler } from './handlers/lalamove.handler';
import { manualCourierHandler } from './handlers/manual-courier.handler';
import { CouriersPluginOptions, PLACEHOLDER_ORIGIN, resolveOptions, ResolvedCouriersOptions } from './options';
import { createReconcileTask } from './reconcile-task';
import { setCouriersInjector } from './runtime';
import { CourierBookingService } from './services/courier-booking.service';
import { EasyParcelAuthService } from './services/easyparcel-auth.service';
import { GeocodingService } from './services/geocoding.service';
import { ShipmentSyncService } from './services/shipment-sync.service';

export { easyParcelRateProvider } from './easyparcel-rate-provider';
export type { LiveRate, LiveRateQuery } from './easyparcel-rate-provider';
export { shipmentEmailHandlers } from './email-handlers';
export type { CouriersPluginOptions, ShopOrigin } from './options';

/**
 * Malaysian couriers: Lalamove (same day, KL & Selangor), EasyParcel (outstation couriers, AWB labels) and
 * couriers booked by hand (e.g. GDex), with tracking for customers (API contract §3).
 *
 * - FulfillmentHandlers `lalamove`, `easyparcel`, `manual-courier`: staff choose one when fulfilling an
 *   order (a ShippingMethod's fulfillment handler is the default).
 * - Fulfillment custom fields: provider, providerOrderId, trackingUrl, labelUrl, shipmentStatus, lastEventAt.
 * - Webhooks POST /delivery/lalamove/webhook and /delivery/easyparcel/webhook/:secret, processed by the
 *   worker; a scheduled task re-checks open shipments every 30 minutes. Delivered → fulfillment Delivered.
 * - EasyParcel accounts connect per channel through OAuth: GET /delivery/easyparcel/connect.
 * - Customer emails when a fulfillment is Shipped (tracking link) and Delivered.
 * - `easyParcelRateProvider` for delivery-my's live rates.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    entities: [EasyParcelConnection, CourierShipmentEvent, CourierGeocode],
    controllers: [CourierWebhookController, CourierAdminController],
    providers: [
        { provide: COURIERS_OPTIONS, useFactory: () => MalaysianCouriersPlugin.options },
        GeocodingService,
        EasyParcelAuthService,
        CourierBookingService,
        ShipmentSyncService,
        EasyParcelRateService,
    ],
    dashboard: './dashboard/index.tsx',
    configuration: config => configure(config, MalaysianCouriersPlugin.options),
})
export class MalaysianCouriersPlugin implements OnApplicationBootstrap {
    static options: ResolvedCouriersOptions = resolveOptions({ origin: PLACEHOLDER_ORIGIN });

    constructor(
        private moduleRef: ModuleRef,
        private processContext: ProcessContext,
    ) {}

    static init(options: CouriersPluginOptions) {
        this.options = resolveOptions(options);
        return MalaysianCouriersPlugin;
    }

    onApplicationBootstrap() {
        setCouriersInjector(new Injector(this.moduleRef));
        if (!this.processContext.isServer) return;
        const options = MalaysianCouriersPlugin.options;
        if (!options.lalamove.configured) Logger.warn('Lalamove is not configured (LALAMOVE_API_KEY, LALAMOVE_API_SECRET).', loggerCtx);
        else if (options.lalamove.sandbox !== options.lalamove.apiKey.startsWith('pk_test')) {
            Logger.warn(`LALAMOVE_SANDBOX=${options.lalamove.sandbox} does not match the API key's environment.`, loggerCtx);
        }
        if (!options.easyParcel.configured) Logger.warn('EasyParcel is not configured (EASYPARCEL_CLIENT_ID, EASYPARCEL_CLIENT_SECRET).', loggerCtx);
        if (!options.google.apiKey) Logger.warn('GOOGLE_MAPS_API_KEY is not set: Lalamove bookings cannot locate addresses.', loggerCtx);
        if (options.origin.lat === PLACEHOLDER_ORIGIN.lat && options.origin.lng === PLACEHOLDER_ORIGIN.lng) {
            Logger.warn('The shop origin uses the placeholder pickup location; set the real pickup address in MalaysianCouriersPlugin.init().', loggerCtx);
        }
    }
}

function configure(config: RuntimeVendureConfig, options: ResolvedCouriersOptions): RuntimeVendureConfig {
    config.customFields.Fulfillment = [...(config.customFields.Fulfillment ?? []), ...fulfillmentCustomFields];
    config.shippingOptions.fulfillmentHandlers = [
        ...config.shippingOptions.fulfillmentHandlers,
        manualCourierHandler,
        createLalamoveHandler(options),
        createEasyParcelHandler(options),
    ];
    config.schedulerOptions.tasks = [...(config.schedulerOptions.tasks ?? []), createReconcileTask(options)];
    // Webhook bodies are read raw (before Vendure's JSON parser) so signatures are checked on the exact bytes.
    config.apiOptions.middleware = [
        ...(config.apiOptions.middleware ?? []),
        { route: LALAMOVE_WEBHOOK_PATH, handler: rawBodyMiddleware(), beforeListen: true },
        { route: EASYPARCEL_WEBHOOK_PATH, handler: rawBodyMiddleware(), beforeListen: true },
    ];
    if (options.customerEmails) addEmailHandlers(config);
    return config;
}

/** Adds the shipped / delivered emails to the EmailPlugin's handlers, when the EmailPlugin is in use. */
function addEmailHandlers(config: RuntimeVendureConfig) {
    const emailPlugin = EmailPlugin as unknown as { options?: { handlers: Array<EmailEventHandler<string, any>> } };
    if (!config.plugins.includes(EmailPlugin) || !emailPlugin.options) {
        Logger.warn('The EmailPlugin is not configured, so customers get no shipped / delivered emails.', loggerCtx);
        return;
    }
    const missing = shipmentEmailHandlers.filter(handler => !emailPlugin.options!.handlers.includes(handler));
    emailPlugin.options.handlers = [...emailPlugin.options.handlers, ...missing];
}
