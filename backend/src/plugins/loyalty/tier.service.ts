import { Inject, Injectable } from '@nestjs/common';
import {
    Customer,
    CustomerGroup,
    CustomerGroupService,
    ID,
    Order,
    RequestContext,
    ScheduledTask,
    TransactionalConnection,
} from '@vendure/core';
import { In } from 'typeorm';
import { LOYALTY_OPTIONS } from './constants';
import { LoyaltyOptions } from './points';
import { SPEND_STATES, TierMember, tierChanges } from './tiers';

/** Group changes go through Vendure in batches of this size (it loads the customers of each call). */
const BATCH = 200;

/**
 * Member tiers: keeps each registered customer in the customer group of the tier their lifetime spend
 * reaches. Runs nightly for everyone and straight after an order of theirs is settled or cancelled.
 * The tier groups are managed here: changes made to them by hand are undone on the next run.
 */
@Injectable()
export class LoyaltyTierService {
    constructor(
        private connection: TransactionalConnection,
        private customerGroupService: CustomerGroupService,
        @Inject(LOYALTY_OPTIONS) private options: LoyaltyOptions,
    ) {}

    get enabled() {
        return this.options.tiers.length > 0;
    }

    /** Updates everyone, or only `customerIds`. Returns how many customers joined and left tier groups. */
    async updateTiers(ctx: RequestContext, customerIds?: ID[]): Promise<{ added: number; removed: number }> {
        if (!this.enabled || customerIds?.length === 0) return { added: 0, removed: 0 };
        return this.connection.withTransaction(ctx, async tx => {
            const groups = await this.tierGroups(tx);
            let added = 0;
            let removed = 0;
            for (const change of tierChanges(await this.members(tx, [...groups.values()], customerIds), this.options.tiers)) {
                const customerGroupId = groups.get(change.group)!.id;
                for (let i = 0; i < change.remove.length; i += BATCH) {
                    const ids = change.remove.slice(i, i + BATCH);
                    await this.customerGroupService.removeCustomersFromGroup(tx, { customerGroupId, customerIds: ids });
                    removed += ids.length;
                }
                for (let i = 0; i < change.add.length; i += BATCH) {
                    const ids = change.add.slice(i, i + BATCH);
                    await this.customerGroupService.addCustomersToGroup(tx, { customerGroupId, customerIds: ids });
                    added += ids.length;
                }
            }
            return { added, removed };
        });
    }

    /** The tier groups by name, creating any that don't exist yet. */
    private async tierGroups(ctx: RequestContext) {
        const names = this.options.tiers.map(t => t.name);
        const existing = await this.connection.getRepository(ctx, CustomerGroup).find({ where: { name: In(names) } });
        const groups = new Map(existing.map(g => [g.name, g]));
        for (const name of names) {
            if (!groups.has(name)) groups.set(name, await this.customerGroupService.create(ctx, { name }));
        }
        return groups;
    }

    /** Lifetime spend of registered customers, plus everyone currently in a tier group. */
    private async members(ctx: RequestContext, groups: CustomerGroup[], customerIds?: ID[]): Promise<TierMember[]> {
        const spendQuery = this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .select('order.customerId', 'customerId')
            .addSelect('SUM(order.subTotalWithTax)', 'spend')
            .innerJoin('order.customer', 'customer')
            // Registered customers only: guests have no user.
            .innerJoin('customer.user', 'user')
            .where('order.state IN (:...states)', { states: SPEND_STATES })
            .andWhere('customer.deletedAt IS NULL')
            .groupBy('order.customerId');
        if (customerIds) spendQuery.andWhere('order.customerId IN (:...customerIds)', { customerIds });
        const spend = await spendQuery.getRawMany<{ customerId: ID; spend: string | number }>();

        const inGroupsQuery = this.connection
            .getRepository(ctx, Customer)
            .createQueryBuilder('customer')
            .innerJoinAndSelect('customer.groups', 'group', 'group.id IN (:...groupIds)', { groupIds: groups.map(g => g.id) })
            .where('customer.deletedAt IS NULL');
        if (customerIds) inGroupsQuery.andWhere('customer.id IN (:...customerIds)', { customerIds });
        const inGroups = await inGroupsQuery.getMany();

        const members = new Map<string, TierMember>();
        for (const row of spend) members.set(String(row.customerId), { customerId: row.customerId, spendSen: Number(row.spend), tierGroups: [] });
        for (const customer of inGroups) {
            const member = members.get(String(customer.id)) ?? { customerId: customer.id, spendSen: 0, tierGroups: [] };
            member.tierGroups = customer.groups.map(g => g.name);
            members.set(String(customer.id), member);
        }
        return [...members.values()];
    }
}

/** The nightly run over all customers; also startable by hand under System → Scheduled Tasks. */
export function memberTiersTask(schedule: string) {
    return new ScheduledTask({
        id: 'loyalty-member-tiers',
        description: 'Moves customers into the member tier their lifetime spend reaches',
        schedule,
        timeout: '10m',
        execute: ({ injector, scheduledContext }) => injector.get(LoyaltyTierService).updateTiers(scheduledContext),
    });
}
