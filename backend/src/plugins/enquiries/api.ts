import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, ListQueryOptions, Permission, RequestContext, Transaction } from '@vendure/core';
import gql from 'graphql-tag';
import { readEnquiryPermission, updateEnquiryPermission } from './constants';
import { Enquiry } from './enquiry.entity';
import { EnquiryService, UpdateEnquiryInput } from './enquiry.service';
import { detailRows } from './format';
import { SubmitEnquiryResult } from './results';
import { EnquiryInput } from './validation';

/** API contract §5 (docs/api-contracts.md). */
export const shopApiExtensions = gql`
    input EnquiryContactInput {
        name: String!
        company: String
        email: String!
        phone: String!
    }
    input EnquiryItemInput {
        productVariantId: ID!
        quantity: Int!
    }
    input SubmitEnquiryInput {
        type: String!
        contact: EnquiryContactInput!
        items: [EnquiryItemInput!]
        details: JSON
    }
    type EnquiryReceipt {
        code: String!
    }
    type EnquiryError implements ErrorResult {
        errorCode: ErrorCode!
        message: String!
    }
    union SubmitEnquiryResult = EnquiryReceipt | EnquiryError

    extend enum ErrorCode {
        "A field is missing or not valid; the message says which."
        ENQUIRY_INPUT_ERROR
        "A chosen gift is unknown, deleted or no longer for sale."
        ENQUIRY_ITEM_UNAVAILABLE_ERROR
        "Too many enquiries from this address in a short time."
        ENQUIRY_RATE_LIMIT_ERROR
    }

    extend type Mutation {
        submitEnquiry(input: SubmitEnquiryInput!): SubmitEnquiryResult!
    }
`;

export const adminApiExtensions = gql`
    enum EnquiryStatus {
        new
        in_progress
        quoted
        confirmed
        closed
    }
    type EnquiryContact {
        name: String!
        company: String
        email: String!
        "International format, e.g. +60123456789"
        phone: String!
    }
    "A chosen gift as it was when the enquiry was sent."
    type EnquiryItem {
        productVariantId: ID!
        productName: String!
        variantName: String!
        sku: String!
        quantity: Int!
        unitPriceWithTax: Money!
    }
    type Enquiry implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        "Reference given to the customer, e.g. ENQ-7G4K2"
        code: String!
        "Which form it came from, e.g. semi-customised"
        type: String!
        status: EnquiryStatus!
        contact: EnquiryContact!
        items: [EnquiryItem!]!
        "Number of gifts across the items"
        totalQuantity: Int!
        "Value of the items at their prices when the enquiry was sent"
        itemsTotalWithTax: Money!
        currencyCode: CurrencyCode!
        "The form's other answers, e.g. style, budgetPerGift, deliveryDate, deliveryAddress, notes"
        details: JSON
        "The details worded for staff, as in the email, e.g. Delivery date: Wed, 20 January 2027"
        detailRows: [EnquiryDetailRow!]!
        internalNotes: String
    }
    type EnquiryDetailRow {
        label: String!
        value: String!
    }
    type EnquiryList implements PaginatedList {
        items: [Enquiry!]!
        totalItems: Int!
    }

    # Generated at run-time by Vendure, with the contact fields below added for search and sorting.
    input EnquiryListOptions
    input EnquiryFilterParameter {
        contactName: StringOperators
        contactCompany: StringOperators
        contactEmail: StringOperators
        contactPhone: StringOperators
    }
    input EnquirySortParameter {
        contactName: SortOrder
        contactCompany: SortOrder
    }

    input UpdateEnquiryInput {
        id: ID!
        status: EnquiryStatus
        internalNotes: String
    }

    extend type Query {
        enquiries(options: EnquiryListOptions): EnquiryList!
        enquiry(id: ID!): Enquiry
        "Enquiry types received so far, for filters"
        enquiryTypes: [String!]!
    }
    extend type Mutation {
        updateEnquiry(input: UpdateEnquiryInput!): Enquiry!
    }
`;

@Resolver()
export class EnquiryShopResolver {
    constructor(private enquiryService: EnquiryService) {}

    @Mutation()
    @Transaction()
    @Allow(Permission.Public)
    submitEnquiry(@Ctx() ctx: RequestContext, @Args() args: { input: EnquiryInput }): Promise<SubmitEnquiryResult> {
        return this.enquiryService.submit(ctx, args.input);
    }
}

@Resolver('SubmitEnquiryResult')
export class SubmitEnquiryResultResolver {
    @ResolveField()
    __resolveType(value: SubmitEnquiryResult) {
        return value.__typename;
    }
}

@Resolver()
export class EnquiryAdminResolver {
    constructor(private enquiryService: EnquiryService) {}

    @Query()
    @Allow(readEnquiryPermission.Permission)
    enquiries(@Ctx() ctx: RequestContext, @Args() args: { options?: ListQueryOptions<Enquiry> }) {
        return this.enquiryService.findAll(ctx, args.options);
    }

    @Query()
    @Allow(readEnquiryPermission.Permission)
    enquiry(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.enquiryService.findOne(ctx, args.id);
    }

    @Query()
    @Allow(readEnquiryPermission.Permission)
    enquiryTypes(@Ctx() ctx: RequestContext) {
        return this.enquiryService.types(ctx);
    }

    @Mutation()
    @Transaction()
    @Allow(updateEnquiryPermission.Permission)
    updateEnquiry(@Ctx() ctx: RequestContext, @Args() args: { input: UpdateEnquiryInput }) {
        return this.enquiryService.update(ctx, args.input);
    }
}

@Resolver('Enquiry')
export class EnquiryEntityResolver {
    @ResolveField()
    contact(@Parent() enquiry: Enquiry) {
        return { name: enquiry.contactName, company: enquiry.contactCompany, email: enquiry.contactEmail, phone: enquiry.contactPhone };
    }

    @ResolveField()
    detailRows(@Parent() enquiry: Enquiry) {
        return detailRows(enquiry.details);
    }
}
