import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    dateLabel,
    deliveryPromise,
    DispatchRules,
    earliestDispatchDate,
    isValidDate,
    nonDispatchDates,
    parseClosedDates,
    shopClock,
    timeLabel,
    weekdaysLabel,
} from './dispatch';

// 2026-10-09 is a Friday; 10 Saturday, 11 Sunday, 12 Monday.
const rules = (closedDates: string[] = []): DispatchRules => ({
    cutoffTime: '15:00',
    dispatchWeekdays: [1, 2, 3, 4, 5, 6],
    closedDates: new Set(closedDates),
});
/** A Malaysian wall-clock time, e.g. myt('2026-10-09T14:59'). */
const myt = (local: string) => new Date(`${local}:00+08:00`);

describe('earliest dispatch date', () => {
    it('a weekday order at 14:59 goes out today; at 15:00 it goes the next day', () => {
        assert.equal(earliestDispatchDate(myt('2026-10-09T14:59'), rules()), '2026-10-09');
        assert.equal(earliestDispatchDate(myt('2026-10-09T15:00'), rules()), '2026-10-10');
    });

    it('Saturday before the cut-off goes out Saturday; after it, Monday', () => {
        assert.equal(earliestDispatchDate(myt('2026-10-10T11:00'), rules()), '2026-10-10');
        assert.equal(earliestDispatchDate(myt('2026-10-10T15:30'), rules()), '2026-10-12');
    });

    it('Sunday orders, morning or night, go out Monday', () => {
        assert.equal(earliestDispatchDate(myt('2026-10-11T09:00'), rules()), '2026-10-12');
        assert.equal(earliestDispatchDate(myt('2026-10-11T23:59'), rules()), '2026-10-12');
    });

    it('closed dates chain: Friday after the cut-off, Saturday and Monday closed → Tuesday', () => {
        assert.equal(earliestDispatchDate(myt('2026-10-09T16:00'), rules(['2026-10-10', '2026-10-12'])), '2026-10-13');
    });

    it('a closed day is skipped even before the cut-off', () => {
        assert.equal(earliestDispatchDate(myt('2026-10-09T10:00'), rules(['2026-10-09'])), '2026-10-10');
    });

    it('a new day starts at midnight in Kuala Lumpur (16:00 UTC)', () => {
        assert.deepEqual(shopClock(new Date('2026-10-11T16:00:00Z')), { date: '2026-10-12', minutes: 0 });
        assert.equal(earliestDispatchDate(new Date('2026-10-11T15:59:00Z'), rules()), '2026-10-12');
        assert.equal(earliestDispatchDate(new Date('2026-10-11T16:00:00Z'), rules()), '2026-10-12');
    });

    it('is the same on a server running in UTC, or anywhere else', () => {
        const before = process.env.TZ;
        try {
            for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Kuala_Lumpur']) {
                process.env.TZ = tz;
                // 06:59 UTC = 14:59 in KL; the server's own clock reads something else entirely.
                const at1459 = new Date('2026-10-09T06:59:00Z');
                if (tz === 'UTC') assert.equal(at1459.getHours(), 6);
                if (tz === 'America/Los_Angeles') assert.equal(at1459.getDate(), 8);
                assert.equal(earliestDispatchDate(at1459, rules()), '2026-10-09', tz);
                assert.equal(earliestDispatchDate(new Date('2026-10-09T07:00:00Z'), rules()), '2026-10-10', tz);
                assert.equal(earliestDispatchDate(new Date('2026-10-10T07:30:00Z'), rules()), '2026-10-12', tz);
            }
        } finally {
            if (before === undefined) delete process.env.TZ;
            else process.env.TZ = before;
        }
    });
});

describe('closed dates typed by staff (Global settings)', () => {
    it('reads one date per line, with or without a note, skipping blanks and # comments', () => {
        const text = '2026-12-25 Christmas Day\n\n# CNY 2027\n2027-02-08\r\n  2027-02-09: second day  \n';
        assert.deepEqual(parseClosedDates(text), { dates: ['2026-12-25', '2027-02-08', '2027-02-09'], errors: [] });
        assert.deepEqual(parseClosedDates(null), { dates: [], errors: [] });
    });

    it('explains lines that are not dates, by line number', () => {
        const { dates, errors } = parseClosedDates('2026-12-25\n25/12/2026\n2026-02-30\n2026-12-24 to 2026-12-26');
        assert.deepEqual(dates, ['2026-12-25']);
        assert.equal(errors.length, 3);
        assert.match(errors[0], /line 2: “25\/12\/2026” isn’t a date/);
        assert.match(errors[1], /line 3/);
        assert.match(errors[2], /line 4: put each date on its own line/);
    });

    it('checks real calendar dates', () => {
        assert.ok(isValidDate('2028-02-29'));
        assert.ok(!isValidDate('2026-02-29'));
        assert.ok(!isValidDate('2026-1-01'));
        assert.ok(!isValidDate(undefined));
    });
});

describe('non-dispatch dates for date pickers', () => {
    it('lists the Sundays and closed dates of the next 90 days', () => {
        const dates = nonDispatchDates(myt('2026-10-09T10:00'), rules(['2026-12-25', '2027-03-01']));
        const sundays = ['2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'];
        assert.deepEqual(dates.slice(0, 8), sundays);
        assert.ok(dates.includes('2026-12-25'));
        assert.ok(!dates.includes('2027-03-01'), 'beyond 90 days');
        assert.equal(dates.length, 14);
        assert.equal(dates[dates.length - 1], '2027-01-03');
    });

    it('includes today when today is a Sunday', () => {
        assert.equal(nonDispatchDates(myt('2026-10-11T10:00'), rules())[0], '2026-10-11');
    });
});

describe('delivery promise', () => {
    const promise = (zone: 'klang-valley' | 'peninsular' | 'unknown', at: string, closed: string[] = []) =>
        deliveryPromise({ zone, zoneLabel: 'Label', now: myt(at), rules: rules(closed), courierDeliveryTime: '3–5 days' });

    it('KL & Selangor before the cut-off: same day', () => {
        const p = promise('klang-valley', '2026-10-09T14:59');
        assert.equal(p.sameDayAvailable, true);
        assert.equal(p.earliestDispatchDate, '2026-10-09');
        assert.equal(p.cutoffTime, '15:00');
        assert.equal(p.message, 'Order before 3pm for same-day delivery.');
    });

    it('KL & Selangor after the cut-off, on Sunday, and on a closed day', () => {
        const late = promise('klang-valley', '2026-10-09T15:00');
        assert.equal(late.sameDayAvailable, false);
        assert.equal(late.message, 'Same-day delivery closes at 3pm. Order now for delivery tomorrow, Saturday 10 October.');
        const sunday = promise('klang-valley', '2026-10-11T10:00');
        assert.equal(sunday.message, 'We don’t dispatch on Sundays. Order now for delivery tomorrow, Monday 12 October.');
        const closed = promise('klang-valley', '2026-10-09T10:00', ['2026-10-09', '2026-10-10']);
        assert.equal(closed.message, 'We’re closed today. Order now for delivery on Monday 12 October.');
    });

    it('outstation is never same day, but still goes out today before the cut-off', () => {
        const p = promise('peninsular', '2026-10-09T10:00');
        assert.equal(p.sameDayAvailable, false);
        assert.equal(p.earliestDispatchDate, '2026-10-09');
        assert.equal(p.message, 'Order before 3pm and we’ll send it by courier today. Delivery normally takes 3–5 days.');
        assert.equal(promise('peninsular', '2026-10-10T16:00').message, 'We’ll send it by courier on Monday 12 October. Delivery normally takes 3–5 days.');
    });

    it('an unknown postcode asks the customer to check it', () => {
        const p = promise('unknown', '2026-10-09T10:00');
        assert.equal(p.sameDayAvailable, false);
        assert.match(p.message, /couldn’t find this postcode/);
    });
});

describe('labels', () => {
    it('writes times and dates the way the shop does', () => {
        assert.equal(timeLabel('15:00'), '3pm');
        assert.equal(timeLabel('15:30'), '3.30pm');
        assert.equal(timeLabel('12:00'), '12pm');
        assert.equal(timeLabel('9:05'), '9.05am');
        assert.equal(timeLabel('00:00'), '12am');
        assert.throws(() => timeLabel('3pm'), /HH:MM/);
        assert.equal(dateLabel('2026-10-12'), 'Monday 12 October');
        assert.equal(weekdaysLabel([1, 2, 3, 4, 5, 6]), 'Monday to Saturday');
        assert.equal(weekdaysLabel([5, 1, 3]), 'Monday, Wednesday and Friday');
    });
});
