import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { adminApiExtensions, ShipOrderResolver } from './api';
import { shipOrderPermission } from './permissions';
import { ShipOrderService } from './ship-order.service';

/**
 * Permissions Vendure doesn't have, so roles can be narrower than its built-in ones.
 *
 * - `ShipOrder`: ship orders (shipOrder, markFulfillmentDelivered and the Ship order block on the order page)
 *   without UpdateOrder, so a packer can't refund, cancel or change orders.
 *
 * Give roles the permission under Settings → Roles (it appears with Vendure's own).
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    providers: [ShipOrderService],
    adminApiExtensions: { schema: adminApiExtensions, resolvers: [ShipOrderResolver] },
    dashboard: './dashboard/index.tsx',
    configuration: config => {
        config.authOptions.customPermissions = [...(config.authOptions.customPermissions ?? []), shipOrderPermission];
        return config;
    },
})
export class StaffPermissionsPlugin {
    static init() {
        return StaffPermissionsPlugin;
    }
}
