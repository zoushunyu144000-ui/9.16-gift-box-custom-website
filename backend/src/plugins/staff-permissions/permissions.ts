import { PermissionDefinition } from '@vendure/core';

/**
 * Shipping on its own. Vendure ties fulfilment to UpdateOrder, which also allows refunds, cancellations and
 * order changes; a packer role gets ReadOrder + ShipOrder instead.
 */
export const shipOrderPermission = new PermissionDefinition({
    name: 'ShipOrder',
    description: 'Ship orders: book delivery, record tracking, mark delivered',
});
