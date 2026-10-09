export const loggerCtx = 'CouriersMy';
export const COURIERS_OPTIONS = Symbol('COURIERS_MY_OPTIONS');
/** Webhook events are processed by the worker through this queue, so the webhook can answer 200 at once. */
export const SYNC_QUEUE = 'couriers-my-sync';
export const RECONCILE_TASK_ID = 'couriers-my-reconcile';

export const LALAMOVE_WEBHOOK_PATH = '/delivery/lalamove/webhook';
export const EASYPARCEL_WEBHOOK_PATH = '/delivery/easyparcel/webhook';
export const EASYPARCEL_CALLBACK_PATH = '/delivery/easyparcel/oauth/callback';
