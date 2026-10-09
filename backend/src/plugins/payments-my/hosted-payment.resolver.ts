import { Args, Mutation, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { CreateHostedPaymentInput, HostedPaymentError, HostedPaymentRedirect, HostedPaymentService } from './hosted-payment.service';

@Resolver()
export class HostedPaymentShopResolver {
    constructor(private readonly hostedPaymentService: HostedPaymentService) {}

    // Owner, like Vendure's own active-order operations: guests get a session, and only their own order is used.
    @Mutation()
    @Allow(Permission.Owner)
    createHostedPayment(@Ctx() ctx: RequestContext, @Args() args: { input: CreateHostedPaymentInput }) {
        return this.hostedPaymentService.createHostedPayment(ctx, args.input);
    }

    @Query()
    @Allow(Permission.Owner)
    hostedPaymentStatus(@Ctx() ctx: RequestContext, @Args() args: { orderCode: string }) {
        return this.hostedPaymentService.hostedPaymentStatus(ctx, args.orderCode);
    }
}

@Resolver('CreateHostedPaymentResult')
export class CreateHostedPaymentResultResolver {
    @ResolveField()
    __resolveType(value: HostedPaymentRedirect | HostedPaymentError): string {
        return value.__typename;
    }
}
