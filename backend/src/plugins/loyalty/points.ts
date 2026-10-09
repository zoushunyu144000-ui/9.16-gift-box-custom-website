import { assertValidTiers, LoyaltyTier } from './tiers';

/*
 * The points rules, free of Vendure so they can be tested on their own. Amounts are in sen (MYR minor
 * units), like everything in Vendure; "ringgit" below means the currency's major unit.
 */

export interface LoyaltyOptions {
    /** Points for each whole ringgit spent on products (after discounts, delivery not counted). 0 turns earning off. */
    pointsPerRinggit: number;
    /** What one point is worth when used, in sen: 1 means 100 points = RM 1. */
    pointValueSen: number;
    /** The fewest points a customer can use on one order. */
    minRedeemPoints: number;
    /** The largest share of an order's products subtotal that points can pay for, in percent. 0 turns redeeming off. */
    maxRedeemPercent: number;
    /** The order state that earns the points; the order must pass through it. */
    earnOnState: string;
    /**
     * Member tiers by lifetime spend, each a customer group, e.g. `[{ name: 'Silver members', minSpendSen: 100000 },
     * { name: 'Gold members', minSpendSen: 500000 }]`. Empty (the default) means no tiers.
     */
    tiers: LoyaltyTier[];
    /** When the nightly tier update runs: a cron expression in server time (03:00 in Malaysia = 19:00 UTC). */
    tierSchedule: string;
}

export const DEFAULT_LOYALTY_OPTIONS: LoyaltyOptions = {
    pointsPerRinggit: 1,
    pointValueSen: 1,
    minRedeemPoints: 500,
    maxRedeemPercent: 50,
    earnOnState: 'PaymentSettled',
    tiers: [],
    tierSchedule: '0 19 * * *',
};

/** Why a ledger entry exists. */
export type LoyaltyReason = 'earned' | 'redeemed' | 'adjusted' | 'reversed';

/** Refuses settings that would make the maths meaningless, so a shop finds out at start-up rather than at checkout. */
export function assertValidLoyaltyOptions(options: LoyaltyOptions): void {
    const wholeNumber = (name: keyof LoyaltyOptions, min: number, max = Number.MAX_SAFE_INTEGER) => {
        const value = options[name];
        if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
            throw new Error(`LoyaltyPlugin: ${name} must be a whole number from ${min}${max < Number.MAX_SAFE_INTEGER ? ` to ${max}` : ''} (got ${String(value)}).`);
        }
    };
    wholeNumber('pointsPerRinggit', 0);
    wholeNumber('pointValueSen', 1);
    wholeNumber('minRedeemPoints', 1);
    wholeNumber('maxRedeemPercent', 0, 100);
    if (typeof options.earnOnState !== 'string' || !options.earnOnState) {
        throw new Error('LoyaltyPlugin: earnOnState must name an order state, e.g. "PaymentSettled".');
    }
    assertValidTiers(options.tiers);
    if (typeof options.tierSchedule !== 'string' || !options.tierSchedule.trim()) {
        throw new Error('LoyaltyPlugin: tierSchedule must be a cron expression, e.g. "0 19 * * *".');
    }
}

/** Points earned on an order: the whole ringgit of its products total (after discounts, no delivery) × the rate. */
export function pointsEarned(productsTotalSen: number, pointsPerRinggit: number): number {
    if (!(productsTotalSen > 0) || !(pointsPerRinggit > 0)) return 0;
    return Math.floor(productsTotalSen / 100) * pointsPerRinggit;
}

/** What `points` take off an order, in sen. */
export function pointsValue(points: number, pointValueSen: number): number {
    return points * pointValueSen;
}

/** The most points an order whose products come to `productsSubtotalSen` can take. */
export function maxRedeemablePoints(productsSubtotalSen: number, options: Pick<LoyaltyOptions, 'pointValueSen' | 'maxRedeemPercent'>): number {
    const capSen = Math.floor((Math.max(0, productsSubtotalSen) * options.maxRedeemPercent) / 100);
    return Math.floor(capSen / options.pointValueSen);
}

/** The products subtotal points are measured against: what the customer sees, i.e. with tax when prices include it. */
export function productsSubtotalSen(order: { subTotal: number; subTotalWithTax: number }, pricesIncludeTax: boolean): number {
    return pricesIncludeTax ? order.subTotalWithTax : order.subTotal;
}

/** 1500 → "1,500" (no locale data needed, so tests and servers agree). */
export function formatPoints(points: number): string {
    return String(points).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface RedemptionRequest {
    /** Points the customer asks to use. */
    points: number;
    /** The customer's current balance. */
    balance: number;
    /** The order's products subtotal before points, in sen. */
    productsSubtotalSen: number;
}

/** Why the points can't be used on this order, worded for the customer; undefined when they can. */
export function redemptionProblem(request: RedemptionRequest, options: LoyaltyOptions): string | undefined {
    const { points, balance, productsSubtotalSen: subtotal } = request;
    if (!Number.isInteger(points) || points < 0) return 'Please enter a whole number of points.';
    if (points === 0) return undefined;
    if (options.maxRedeemPercent === 0) return 'Points can’t be used on orders at the moment.';
    if (points < options.minRedeemPoints) return `Please use at least ${formatPoints(options.minRedeemPoints)} points.`;
    if (points > balance) {
        return balance > 0 ? `You have ${formatPoints(balance)} points to use.` : 'You don’t have any points to use yet.';
    }
    const max = maxRedeemablePoints(subtotal, options);
    if (points > max) {
        const share = `Points can pay for up to ${options.maxRedeemPercent}% of the items in your bag`;
        return max >= options.minRedeemPoints
            ? `${share}, so up to ${formatPoints(max)} points on this order.`
            : `${share}, so this order is too small to use points.`;
    }
    return undefined;
}

/** Points the customer asked to use on an order, stored in Order.customFields.loyaltyPointsApplied. */
export function pointsRequestedOn(order: { customFields?: unknown }): number {
    const value = (order.customFields as { loyaltyPointsApplied?: number | null } | undefined)?.loyaltyPointsApplied;
    return typeof value === 'number' && value > 0 ? value : 0;
}

/** The automatic entries an order can have, each at most once. */
export type OrderEntryKind = 'earned' | 'redeemed' | 'earned-reversed' | 'redeemed-reversed';

/** The unique key of an automatic order entry, so a replayed event can't add it twice. */
export function orderEntryKey(orderId: string | number, kind: OrderEntryKind): string {
    return `order:${orderId}:${kind}`;
}

export interface LedgerEntryLike {
    customerId: string | number;
    points: number;
    uniqueKey?: string | null;
}

export interface PlannedEntry {
    customerId: string | number;
    points: number;
    reason: LoyaltyReason;
    uniqueKey: string;
    note: string;
}

/**
 * What to add when an order is cancelled: take back the points it earned and give back the points spent on
 * it, each once and to the customer who had them. Run again after those entries exist, it plans nothing.
 */
export function cancellationEntries(orderId: string | number, existing: LedgerEntryLike[]): PlannedEntry[] {
    const find = (kind: OrderEntryKind) => existing.find(e => e.uniqueKey === orderEntryKey(orderId, kind));
    const planned: PlannedEntry[] = [];
    const earned = find('earned');
    if (earned && earned.points !== 0 && !find('earned-reversed')) {
        planned.push({
            customerId: earned.customerId,
            points: -earned.points,
            reason: 'reversed',
            uniqueKey: orderEntryKey(orderId, 'earned-reversed'),
            note: 'Order cancelled: points earned on it removed',
        });
    }
    const redeemed = find('redeemed');
    if (redeemed && redeemed.points !== 0 && !find('redeemed-reversed')) {
        planned.push({
            customerId: redeemed.customerId,
            points: -redeemed.points,
            reason: 'reversed',
            uniqueKey: orderEntryKey(orderId, 'redeemed-reversed'),
            note: 'Order cancelled: points used on it returned',
        });
    }
    return planned;
}
