import { Args, Mutation, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { LoyaltyHistoryOptions, LoyaltyPointsError, LoyaltyService } from '../loyalty.service';

@Resolver()
export class LoyaltyShopResolver {
    constructor(private loyaltyService: LoyaltyService) {}

    @Query()
    @Allow(Permission.Public)
    loyaltySettings() {
        return this.loyaltyService.getSettings();
    }

    @Query()
    @Allow(Permission.Authenticated)
    async loyaltyHistory(@Ctx() ctx: RequestContext, @Args() args: { options?: LoyaltyHistoryOptions | null }) {
        const customer = await this.loyaltyService.activeCustomer(ctx);
        // A signed-in administrator has no customer, so no history.
        if (!customer) return { items: [], totalItems: 0 };
        return this.loyaltyService.history(ctx, customer.id, args.options ?? {});
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Owner)
    applyLoyaltyPoints(@Ctx() ctx: RequestContext, @Args() args: { points: number }) {
        return this.loyaltyService.applyToActiveOrder(ctx, args.points);
    }
}

/** Tells GraphQL which member of the ApplyLoyaltyPointsResult union a result is. */
@Resolver('ApplyLoyaltyPointsResult')
export class ApplyLoyaltyPointsResultResolver {
    @ResolveField()
    __resolveType(value: unknown): string {
        return value instanceof LoyaltyPointsError ? 'LoyaltyPointsError' : 'Order';
    }
}
