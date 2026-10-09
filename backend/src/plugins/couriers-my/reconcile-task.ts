import { ScheduledTask } from '@vendure/core';
import { RECONCILE_TASK_ID } from './constants';
import { ResolvedCouriersOptions } from './options';
import { ShipmentSyncService } from './services/shipment-sync.service';

/**
 * Every 30 minutes (by default): re-checks Lalamove and EasyParcel shipments whose fulfillment is not yet
 * Delivered and whose courier status is not failed or cancelled, in case a webhook was lost, and refreshes
 * EasyParcel tokens expiring within the hour.
 * Runs in the worker; staff can also run it from the dashboard's scheduled tasks or POST /delivery/shipments/reconcile.
 */
export function createReconcileTask(options: ResolvedCouriersOptions): ScheduledTask {
    return new ScheduledTask({
        id: RECONCILE_TASK_ID,
        description: 'Re-check open Lalamove and EasyParcel shipments and refresh EasyParcel tokens',
        schedule: options.reconcileSchedule,
        timeout: '10m',
        preventOverlap: true,
        execute: async ({ injector }) => injector.get(ShipmentSyncService).reconcile(),
    });
}
