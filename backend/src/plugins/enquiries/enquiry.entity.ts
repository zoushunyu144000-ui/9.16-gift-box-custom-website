import { Channel, CurrencyCode, DeepPartial, EntityId, ID, Money, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { EnquiryStatus } from './constants';
import { EnquiryDetails } from './validation';

/** A gift chosen in the enquiry, as it was when the enquiry was sent (later price or name changes don't alter it). */
export interface EnquiryItemSnapshot {
    productVariantId: ID;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    /** Price of one, with tax, in sen. */
    unitPriceWithTax: number;
}

/**
 * A quote request from the storefront (e.g. corporate gifts). Contact details are separate columns so the
 * dashboard can search them; the chosen gifts and the form's other answers are stored as sent.
 */
@Entity()
export class Enquiry extends VendureEntity {
    constructor(input?: DeepPartial<Enquiry>) {
        super(input);
    }

    /** Short reference for customers and staff, e.g. ENQ-7G4K2. */
    @Index({ unique: true })
    @Column({ length: 32 })
    code: string;

    /** Which form it came from, e.g. semi-customised or fully-customised. */
    @Column({ length: 40 })
    type: string;

    @Index()
    @Column({ type: 'varchar', length: 20, default: 'new' })
    status: EnquiryStatus;

    @Column({ length: 100 })
    contactName: string;

    @Column({ type: 'varchar', length: 120, nullable: true })
    contactCompany: string | null;

    @Column({ length: 254 })
    contactEmail: string;

    /** International format, e.g. +60123456789. */
    @Column({ length: 20 })
    contactPhone: string;

    @Column('simple-json')
    items: EnquiryItemSnapshot[];

    /** Number of gifts across the chosen items. */
    @Column({ type: 'int', default: 0 })
    totalQuantity: number;

    /** Value of the chosen items at their prices when the enquiry was sent, before customisation and delivery. */
    @Money({ default: 0 })
    itemsTotalWithTax: number;

    @Column('varchar')
    currencyCode: CurrencyCode;

    /** The form's other answers, e.g. style, budgetPerGift, deliveryDate, deliveryAddress, notes. */
    @Column('simple-json', { nullable: true })
    details: EnquiryDetails | null;

    /** Staff notes, never shown to the customer. */
    @Column({ type: 'text', nullable: true })
    internalNotes: string | null;

    @Index()
    @ManyToOne(type => Channel, { onDelete: 'CASCADE' })
    channel: Channel;

    @EntityId()
    channelId: ID;
}
