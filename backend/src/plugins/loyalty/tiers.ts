/** Member tier rules, free of Vendure so they can be tested on their own. */

type Id = string | number;

export interface LoyaltyTier {
    /** The customer group that holds the tier's members, e.g. "Gold members" (created when missing). */
    name: string;
    /** Lifetime spend that reaches the tier, in sen: products after discounts on paid orders, delivery not counted. */
    minSpendSen: number;
}

/** States of orders that count as spent: paid, and not cancelled. */
export const SPEND_STATES = ['PaymentSettled', 'PartiallyShipped', 'Shipped', 'PartiallyDelivered', 'Delivered'];

/** The tier a lifetime spend reaches: the highest threshold it meets, or none below the lowest. */
export function tierFor(spendSen: number, tiers: LoyaltyTier[]): LoyaltyTier | undefined {
    return [...tiers].sort((a, b) => b.minSpendSen - a.minSpendSen).find(t => spendSen >= t.minSpendSen);
}

export interface TierMember {
    customerId: Id;
    spendSen: number;
    /** Names of the tier groups the customer is in now. */
    tierGroups: string[];
}

export interface TierChange {
    group: string;
    add: Id[];
    remove: Id[];
}

/** The group moves that leave each customer in exactly the tier their spend reaches, and in no other tier group. */
export function tierChanges(members: TierMember[], tiers: LoyaltyTier[]): TierChange[] {
    const changes = new Map<string, TierChange>(tiers.map(t => [t.name, { group: t.name, add: [], remove: [] }]));
    for (const member of members) {
        const target = tierFor(member.spendSen, tiers)?.name;
        for (const group of member.tierGroups) {
            if (group !== target) changes.get(group)?.remove.push(member.customerId);
        }
        if (target && !member.tierGroups.includes(target)) changes.get(target)?.add.push(member.customerId);
    }
    return [...changes.values()].filter(c => c.add.length > 0 || c.remove.length > 0);
}

/** Refuses tier settings that can't be applied, so a shop finds out at start-up. */
export function assertValidTiers(tiers: LoyaltyTier[]): void {
    if (!Array.isArray(tiers)) throw new Error('LoyaltyPlugin: tiers must be a list (empty for no tiers).');
    const names = new Set<string>();
    const thresholds = new Set<number>();
    for (const tier of tiers) {
        if (typeof tier?.name !== 'string' || !tier.name.trim()) throw new Error('LoyaltyPlugin: every tier needs a name (its customer group).');
        if (names.has(tier.name)) throw new Error(`LoyaltyPlugin: tier "${tier.name}" is listed twice.`);
        if (!Number.isInteger(tier.minSpendSen) || tier.minSpendSen < 1) {
            throw new Error(`LoyaltyPlugin: tier "${tier.name}" needs minSpendSen, a whole number of sen above 0.`);
        }
        if (thresholds.has(tier.minSpendSen)) throw new Error(`LoyaltyPlugin: two tiers start at ${tier.minSpendSen} sen.`);
        names.add(tier.name);
        thresholds.add(tier.minSpendSen);
    }
}
