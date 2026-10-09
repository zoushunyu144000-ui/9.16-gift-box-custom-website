import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, CustomerService, EntityNotFoundError, ID, Permission, RequestContext, Transaction } from '@vendure/core';
import { LoyaltyHistoryOptions, LoyaltyService } from '../loyalty.service';

@Resolver()
export class LoyaltyAdminResolver {
    constructor(
        private loyaltyService: LoyaltyService,
        private customerService: CustomerService,
    ) {}

    @Query()
    @Allow(Permission.ReadCustomer)
    loyaltySettings() {
        return this.loyaltyService.getSettings();
    }

    @Query()
    @Allow(Permission.ReadCustomer)
    async customerLoyaltyHistory(@Ctx() ctx: RequestContext, @Args() args: { customerId: ID; options?: LoyaltyHistoryOptions | null }) {
        // Only customers of the active channel.
        const customer = await this.customerService.findOne(ctx, args.customerId);
        if (!customer) throw new EntityNotFoundError('Customer', args.customerId);
        return this.loyaltyService.history(ctx, customer.id, args.options ?? {});
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCustomer)
    adjustLoyaltyPoints(@Ctx() ctx: RequestContext, @Args() args: { customerId: ID; points: number; note: string }) {
        return this.loyaltyService.adjust(ctx, args.customerId, args.points, args.note);
    }
}
