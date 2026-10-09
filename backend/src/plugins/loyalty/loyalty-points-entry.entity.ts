import { Administrator, Customer, DeepPartial, EntityId, ID, Order, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { LoyaltyReason } from './points';

/**
 * One line of a customer's points ledger. The balance (Customer.customFields.loyaltyPoints) is the sum of
 * these and is updated in the same transaction as each new line.
 */
@Entity()
export class LoyaltyPointsEntry extends VendureEntity {
    constructor(input?: DeepPartial<LoyaltyPointsEntry>) {
        super(input);
    }

    @Index()
    @ManyToOne(type => Customer, { onDelete: 'CASCADE' })
    customer: Customer;

    @EntityId()
    customerId: ID;

    /** The order that earned or used the points; null for staff adjustments. */
    @Index()
    @ManyToOne(type => Order, { nullable: true, onDelete: 'SET NULL' })
    order: Order | null;

    @EntityId({ nullable: true })
    orderId: ID | null;

    /** Positive when points are added, negative when they are taken. */
    @Column('int')
    points: number;

    @Column('varchar')
    reason: LoyaltyReason;

    @Column({ type: 'text', nullable: true })
    note: string | null;

    /** Makes automatic entries happen once, e.g. "order:42:earned". Null for staff adjustments. */
    @Column({ type: 'varchar', nullable: true, unique: true })
    uniqueKey: string | null;

    /** Who made a staff adjustment. */
    @ManyToOne(type => Administrator, { nullable: true, onDelete: 'SET NULL' })
    administrator: Administrator | null;

    @EntityId({ nullable: true })
    administratorId: ID | null;
}
