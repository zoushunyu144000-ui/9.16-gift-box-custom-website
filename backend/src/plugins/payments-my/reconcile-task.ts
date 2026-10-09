import { ScheduledTask } from '@vendure/core';
import { HostedPaymentService, ReconcileParams } from './hosted-payment.service';

/**
 * Every 15 minutes, in the worker: asks CHIP and Billplz about payment pages opened between 10 minutes and 3 days
 * ago that no callback or returning customer has confirmed, and records any that were paid. It catches the
 * customer who paid and closed the browser while callbacks couldn't reach the server. Run it now from the
 * dashboard (Settings → Scheduled tasks) or with the Admin API's runScheduledTask.
 */
export const reconcileHostedPaymentsTask = new ScheduledTask<ReconcileParams>({
    id: 'reconcile-hosted-payments',
    description: 'Record CHIP and Billplz payments that no callback has confirmed',
    params: { olderThanMinutes: 10, newerThanHours: 72, batchSize: 50 },
    schedule: cron => cron.every(15).minutes(),
    // Each gateway request may take up to the gateway timeout.
    timeout: '10m',
    execute: ({ injector, params }) => injector.get(HostedPaymentService).reconcile(params),
});
