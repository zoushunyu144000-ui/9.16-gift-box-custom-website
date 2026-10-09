import { CustomFieldConfig, LanguageCode } from '@vendure/core';
import { STATUS_LABELS } from './status';
import { SHIPMENT_STATUSES } from './types';

const en = (value: string) => [{ languageCode: LanguageCode.en, value }];

/**
 * Fulfillment custom fields (API contract §3). Customers read `trackingUrl` and `shipmentStatus` through
 * the Shop API; the rest is for staff. All are written by this plugin only (readonly in the APIs).
 */
export const fulfillmentCustomFields: CustomFieldConfig[] = [
    {
        name: 'provider',
        type: 'string',
        nullable: true,
        public: false,
        readonly: true,
        label: en('Courier service'),
        options: [
            { value: 'lalamove', label: en('Lalamove') },
            { value: 'easyparcel', label: en('EasyParcel') },
            { value: 'manual', label: en('Courier booked by hand') },
        ],
    },
    {
        name: 'providerOrderId',
        type: 'string',
        nullable: true,
        public: false,
        readonly: true,
        label: en('Courier booking id'),
        description: en('Lalamove order id or EasyParcel shipment number'),
    },
    {
        name: 'trackingUrl',
        type: 'string',
        length: 1024,
        nullable: true,
        public: true,
        readonly: true,
        label: en('Tracking link'),
    },
    {
        name: 'labelUrl',
        type: 'string',
        length: 1024,
        nullable: true,
        public: false,
        readonly: true,
        label: en('Shipping label'),
    },
    {
        name: 'shipmentStatus',
        type: 'string',
        nullable: true,
        public: true,
        readonly: true,
        label: en('Shipment status'),
        options: SHIPMENT_STATUSES.map(value => ({ value, label: en(STATUS_LABELS[value]) })),
    },
    {
        name: 'lastEventAt',
        type: 'datetime',
        nullable: true,
        public: false,
        readonly: true,
        label: en('Last courier update'),
    },
];
