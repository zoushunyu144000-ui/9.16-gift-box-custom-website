import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Permission, PERMISSIONS_METADATA_KEY, PermissionDefinition, RuntimeVendureConfig } from '@vendure/core';
import { TRANSACTION_MODE_METADATA_KEY } from '@vendure/core/dist/api/decorators/transaction.decorator';
import { ShipOrderResolver } from './api';
import { shipOrderPermission } from './permissions';
import { orderCanShip, shipmentProblem, unshippedLines } from './shipping';
import { StaffPermissionsPlugin } from './staff-permissions.plugin';

const method = (name: 'shipOrder' | 'markFulfillmentDelivered') => ShipOrderResolver.prototype[name];

describe('ShipOrder permission', () => {
    it('is an assignable permission named ShipOrder', () => {
        assert.equal(shipOrderPermission.Permission, 'ShipOrder');
        assert.deepEqual(shipOrderPermission.getMetadata(), [
            {
                name: 'ShipOrder',
                description: 'Ship orders: book delivery, record tracking, mark delivered',
                assignable: true,
                internal: false,
            },
        ]);
    });

    it('is added to the server’s permissions, keeping any others', () => {
        const other = new PermissionDefinition({ name: 'SomethingElse' });
        const config = { authOptions: { customPermissions: [other] } } as unknown as RuntimeVendureConfig;
        const configured = Reflect.getMetadata('configuration', StaffPermissionsPlugin)(config) as RuntimeVendureConfig;
        assert.deepEqual(
            configured.authOptions.customPermissions.map(p => p.getMetadata()[0].name),
            ['SomethingElse', 'ShipOrder'],
        );
    });

    it('is the only permission shipOrder and markFulfillmentDelivered need, so UpdateOrder is not required', () => {
        for (const name of ['shipOrder', 'markFulfillmentDelivered'] as const) {
            const permissions = Reflect.getMetadata(PERMISSIONS_METADATA_KEY, method(name));
            assert.deepEqual(permissions, ['ShipOrder'], name);
            assert.ok(!permissions.includes(Permission.UpdateOrder), name);
        }
    });

    it('runs both mutations in a transaction', () => {
        assert.equal(Reflect.getMetadata(TRANSACTION_MODE_METADATA_KEY, method('shipOrder')), 'auto');
        assert.equal(Reflect.getMetadata(TRANSACTION_MODE_METADATA_KEY, method('markFulfillmentDelivered')), 'auto');
    });
});

describe('what is left to ship', () => {
    const lines = [
        { id: 1, quantity: 3 },
        { id: 2, quantity: 1 },
    ];

    it('is everything when nothing has shipped', () => {
        assert.deepEqual(unshippedLines(lines, []), [
            { orderLineId: 1, quantity: 3 },
            { orderLineId: 2, quantity: 1 },
        ]);
    });

    it('subtracts live fulfilments, matching ids given as strings', () => {
        const fulfillments = [{ state: 'Shipped', lines: [{ orderLineId: '1', quantity: 2 }] }];
        assert.deepEqual(unshippedLines(lines, fulfillments), [
            { orderLineId: 1, quantity: 1 },
            { orderLineId: 2, quantity: 1 },
        ]);
    });

    it('counts cancelled fulfilments as not shipped', () => {
        const fulfillments = [
            { state: 'Cancelled', lines: [{ orderLineId: 1, quantity: 3 }] },
            { state: 'Delivered', lines: [{ orderLineId: 2, quantity: 1 }] },
        ];
        assert.deepEqual(unshippedLines(lines, fulfillments), [{ orderLineId: 1, quantity: 3 }]);
    });

    it('is nothing once everything has shipped', () => {
        const fulfillments = [{ state: 'Pending', lines: [{ orderLineId: 1, quantity: 3 }, { orderLineId: 2, quantity: 1 }] }];
        assert.deepEqual(unshippedLines(lines, fulfillments), []);
    });
});

describe('when an order can ship', () => {
    it('follows the order process: paid orders and partly shipped or delivered ones', () => {
        assert.ok(orderCanShip('PaymentSettled', ['PartiallyDelivered', 'Delivered', 'PartiallyShipped', 'Shipped', 'Cancelled', 'Modifying']));
        assert.ok(orderCanShip('PartiallyShipped', ['Shipped', 'PartiallyDelivered', 'Cancelled', 'Modifying']));
        assert.ok(orderCanShip('PartiallyDelivered', ['Delivered', 'Cancelled', 'Modifying']));
    });

    it('refuses orders not yet paid, cancelled, or being changed', () => {
        assert.ok(!orderCanShip('PaymentAuthorized', ['PaymentSettled', 'Cancelled', 'Modifying', 'ArrangingAdditionalPayment']));
        assert.ok(!orderCanShip('ArrangingPayment', ['PaymentAuthorized', 'PaymentSettled', 'AddingItems', 'Cancelled']));
        assert.ok(!orderCanShip('Cancelled', []));
        assert.ok(!orderCanShip('Modifying', ['PaymentSettled', 'PartiallyShipped', 'Shipped']));
        assert.ok(!orderCanShip('ArrangingAdditionalPayment', ['PaymentSettled', 'PartiallyShipped', 'Shipped']));
    });
});

describe('checking the lines to ship', () => {
    const orderLines = [{ id: 1 }, { id: '2' }];

    it('accepts this order’s lines with whole quantities', () => {
        assert.equal(shipmentProblem([{ orderLineId: '1', quantity: 2 }, { orderLineId: 2, quantity: 0 }], orderLines), undefined);
    });

    it('refuses lines of another order', () => {
        assert.equal(shipmentProblem([{ orderLineId: 99, quantity: 1 }], orderLines), 'Order line 99 is not on this order.');
    });

    it('refuses negative or fractional quantities', () => {
        assert.match(shipmentProblem([{ orderLineId: 1, quantity: -1 }], orderLines) ?? '', /whole numbers/);
        assert.match(shipmentProblem([{ orderLineId: 1, quantity: 1.5 }], orderLines) ?? '', /whole numbers/);
    });
});
