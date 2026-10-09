import { DeepPartial, EntityId, ID, Money, Order, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne } from 'typeorm';

/**
 * pending: page opened, not paid yet · failed: an attempt failed, the customer may still pay ·
 * paid: recorded on the order · cancelled / expired / refunded: the gateway closed it ·
 * held: paid, but its payment method is switched off; recorded once it is back on (a note says so) ·
 * unmatched: paid at the gateway but never to be recorded automatically (a note on the order says why).
 */
export type AttemptStatus = 'pending' | 'failed' | 'paid' | 'cancelled' | 'expired' | 'refunded' | 'held' | 'unmatched';

/**
 * One hosted payment page opened for an order: a CHIP purchase or a Billplz bill. It lets callbacks and
 * returning customers be matched to the order (Billplz callbacks don't say which order they are for), and
 * it is what a status check asks the gateway about.
 */
@Entity()
@Index(['gateway', 'reference'], { unique: true })
export class HostedPaymentAttempt extends VendureEntity {
    constructor(input?: DeepPartial<HostedPaymentAttempt>) {
        super(input);
    }

    @Index()
    @ManyToOne(type => Order, { onDelete: 'CASCADE' })
    order: Order;

    @EntityId()
    orderId: ID;

    @Column()
    orderCode: string;

    /** The order's channel; callbacks act in it. */
    @EntityId()
    channelId: ID;

    @Column()
    paymentMethodCode: string;

    /** Handler code: chip or billplz. */
    @Column({ type: 'varchar', length: 32 })
    gateway: string;

    /** CHIP purchase id or Billplz bill id. */
    @Column()
    reference: string;

    /** Amount asked for, sen. */
    @Money()
    amount: number;

    @Column({ type: 'varchar', length: 3 })
    currencyCode: string;

    @Column({ type: 'varchar', length: 16, default: 'pending' })
    status: AttemptStatus;

    /** When a status check last asked the gateway about it; the scheduled check takes the least recent first. */
    @Column({ type: Date, nullable: true })
    checkedAt: Date | null;
}
