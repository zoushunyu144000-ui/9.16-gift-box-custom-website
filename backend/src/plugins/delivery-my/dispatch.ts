import { DeliveryZone } from './types';

/**
 * Dispatch dates. Everything runs on the shop's calendar (Malaysia: one time zone, no daylight saving),
 * whatever time zone the server is in, so "today", the cut-off and Sundays are always Kuala Lumpur's.
 */
export const SHOP_TIME_ZONE = 'Asia/Kuala_Lumpur';

export interface DispatchRules {
    /** 24-hour "HH:MM": orders confirmed before it are dispatched that day. */
    cutoffTime: string;
    /** 0 = Sunday … 6 = Saturday. */
    dispatchWeekdays: readonly number[];
    /** YYYY-MM-DD dates without dispatch (public holidays, shop closures). */
    closedDates: ReadonlySet<string>;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 0 → "Sunday". */
export function weekdayName(day: number): string {
    return WEEKDAYS[day];
}

const shopClockFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});
const dateLabelFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** The shop's date (YYYY-MM-DD) and minutes since its midnight at the instant `now`. */
export function shopClock(now: Date): { date: string; minutes: number } {
    const parts: Record<string, string> = {};
    for (const part of shopClockFormat.formatToParts(now)) parts[part.type] = part.value;
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** "15:00" → 900. */
export function minutesOf(time: string): number {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
        throw new Error(`delivery-my: cut-off time "${time}" should be 24-hour HH:MM, e.g. "15:00".`);
    }
    return Number(match[1]) * 60 + Number(match[2]);
}

/** "9:30" → "09:30". */
export function normaliseTime(time: string): string {
    const minutes = minutesOf(time);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function utcDate(date: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

/** A real calendar date written YYYY-MM-DD (so not 2026-02-30). */
export function isValidDate(value: string | null | undefined): value is string {
    return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && utcDate(value).toISOString().startsWith(value);
}

export function addDays(date: string, days: number): string {
    const d = utcDate(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
    return utcDate(date).getUTCDay();
}

export function isDispatchDay(date: string, rules: DispatchRules): boolean {
    return rules.dispatchWeekdays.includes(weekdayOf(date)) && !rules.closedDates.has(date);
}

/** The first dispatch day from `date` (that day included or not), skipping Sundays and closed dates. */
export function nextDispatchDay(date: string, rules: DispatchRules, includeDate: boolean): string {
    let candidate = includeDate ? date : addDays(date, 1);
    for (let i = 0; i < 400; i++) {
        if (isDispatchDay(candidate, rules)) return candidate;
        candidate = addDays(candidate, 1);
    }
    throw new Error('delivery-my: no dispatch day in the next 400 days; check dispatchWeekdays and the closed dates.');
}

/** Today if it's a dispatch day and before the cut-off, else the next dispatch day. */
export function earliestDispatchDate(now: Date, rules: DispatchRules): string {
    const { date, minutes } = shopClock(now);
    return nextDispatchDay(date, rules, minutes < minutesOf(rules.cutoffTime));
}

/** Every date from today through the next `days` days that the shop doesn't dispatch: Sundays and closed dates. */
export function nonDispatchDates(now: Date, rules: DispatchRules, days = 90): string[] {
    const today = shopClock(now).date;
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
        const date = addDays(today, i);
        if (!isDispatchDay(date, rules)) dates.push(date);
    }
    return dates;
}

/**
 * Closed dates as staff type them in Global settings: one YYYY-MM-DD per line, optionally followed by a note
 * ("2026-12-25 Christmas Day"). Empty lines and lines starting with # are skipped.
 */
export function parseClosedDates(text: string | null | undefined): { dates: string[]; errors: string[] } {
    const dates: string[] = [];
    const errors: string[] = [];
    (text ?? '').split(/\r?\n/).forEach((raw, index) => {
        const line = raw.trim();
        if (!line || line.startsWith('#')) return;
        const match = /^(\d{4}-\d{2}-\d{2})(?![\d-])(.*)$/.exec(line);
        if (!match || !isValidDate(match[1])) {
            errors.push(`Closed dates, line ${index + 1}: “${line}” isn’t a date. Write one date per line as YYYY-MM-DD, e.g. 2026-12-25.`);
        } else if (/\d{4}-\d{2}-\d{2}/.test(match[2])) {
            // "2026-12-24 to 2026-12-26" would otherwise close only the first day.
            errors.push(`Closed dates, line ${index + 1}: put each date on its own line (ranges aren’t read).`);
        } else {
            dates.push(match[1]);
        }
    });
    return { dates, errors };
}

/**
 * What's wrong with a preferred delivery date, worded for the customer and for staff; undefined when it's fine.
 * A good date is a dispatch day (not a Sunday or closed date) on or after the earliest dispatch date.
 */
export function preferredDateProblem(date: string, earliest: string, rules: DispatchRules): { customer: string; staff: string } | undefined {
    if (!isValidDate(date)) {
        return {
            customer: 'Please choose your delivery date again; we couldn’t read the date chosen.',
            staff: `The preferred delivery date “${date}” isn’t a date.`,
        };
    }
    if (date < earliest) {
        return {
            customer: `The earliest delivery date we can offer is ${dateLabel(earliest)}. Please choose that date or later.`,
            staff: `The preferred delivery date, ${dateLabel(date)}, is before the earliest dispatch date (${dateLabel(earliest)}).`,
        };
    }
    if (rules.closedDates.has(date)) {
        return {
            customer: `We’re closed on ${dateLabel(date)}. Please choose another delivery date.`,
            staff: `The preferred delivery date, ${dateLabel(date)}, is a closed date.`,
        };
    }
    const weekday = weekdayName(weekdayOf(date));
    if (!rules.dispatchWeekdays.includes(weekdayOf(date))) {
        return {
            customer: `We don’t deliver on ${weekday}s. Please choose another delivery date.`,
            staff: `The preferred delivery date, ${dateLabel(date)}, is a ${weekday}, when the shop doesn’t dispatch.`,
        };
    }
    return undefined;
}

/** "15:00" → "3pm", "15:30" → "3.30pm", "12:00" → "12pm". */
export function timeLabel(time: string): string {
    const minutes = minutesOf(time);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}${minute ? `.${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

/** "2026-10-12" → "Monday 12 October". */
export function dateLabel(date: string): string {
    return dateLabelFormat.format(utcDate(date));
}

/** [1, 2, 3, 4, 5, 6] → "Monday to Saturday"; [1, 3, 5] → "Monday, Wednesday and Friday". */
export function weekdaysLabel(weekdays: readonly number[]): string {
    const days = [...new Set(weekdays)].sort((a, b) => a - b);
    if (days.length === 7) return 'every day';
    const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    if (days.length > 2 && consecutive) return `${WEEKDAYS[days[0]]} to ${WEEKDAYS[days[days.length - 1]]}`;
    const names = days.map(d => WEEKDAYS[d]);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
}

export interface DeliveryPromise {
    zone: DeliveryZone;
    zoneLabel: string;
    sameDayAvailable: boolean;
    earliestDispatchDate: string;
    cutoffTime: string;
    closedDates: string[];
    message: string;
}

export interface DeliveryPromiseInput {
    zone: DeliveryZone;
    zoneLabel: string;
    now: Date;
    rules: DispatchRules;
    /** e.g. "3–5 days". */
    courierDeliveryTime: string;
    /** How far ahead closedDates looks. */
    horizonDays?: number;
}

/** What the storefront shows for a postcode: zone, earliest dispatch, dates to grey out, and one sentence for the customer. */
export function deliveryPromise(input: DeliveryPromiseInput): DeliveryPromise {
    const { zone, now, rules } = input;
    const today = shopClock(now).date;
    const earliest = earliestDispatchDate(now, rules);
    const cutoff = timeLabel(rules.cutoffTime);
    const sameDayAvailable = zone === 'klang-valley' && earliest === today;
    const on = earliest === addDays(today, 1) ? `tomorrow, ${dateLabel(earliest)}` : `on ${dateLabel(earliest)}`;

    let message: string;
    if (zone === 'unknown') {
        // A brand-new postcode may be missing from the official table; checkout then goes by the state chosen.
        message = 'We couldn’t find this postcode. Please check it; if it’s right, delivery goes by the state you choose at checkout.';
    } else if (zone === 'klang-valley') {
        if (sameDayAvailable) {
            message = `Order before ${cutoff} for same-day delivery.`;
        } else {
            const reason = !rules.dispatchWeekdays.includes(weekdayOf(today))
                ? `We don’t dispatch on ${WEEKDAYS[weekdayOf(today)]}s.`
                : rules.closedDates.has(today)
                  ? 'We’re closed today.'
                  : `Same-day delivery closes at ${cutoff}.`;
            message = `${reason} Order now for delivery ${on}.`;
        }
    } else {
        message =
            earliest === today
                ? `Order before ${cutoff} and we’ll send it by courier today. Delivery normally takes ${input.courierDeliveryTime}.`
                : `We’ll send it by courier ${on}. Delivery normally takes ${input.courierDeliveryTime}.`;
    }

    return {
        zone,
        zoneLabel: input.zoneLabel,
        sameDayAvailable,
        earliestDispatchDate: earliest,
        cutoffTime: normaliseTime(rules.cutoffTime),
        closedDates: nonDispatchDates(now, rules, input.horizonDays ?? 90),
        message,
    };
}
