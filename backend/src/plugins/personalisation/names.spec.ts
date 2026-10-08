import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NAMES_PATTERN, namesLimit } from './names';

describe('personalised names', () => {
    it('takes capital letters, numbers and the punctuation of a numbered list', () => {
        assert.ok(NAMES_PATTERN.test('SARAH TAN'));
        assert.ok(NAMES_PATTERN.test("1. JASON\n2. EMILY O'NEIL\n3. LIM & TAN-WONG"));
    });

    it('refuses lower case and other scripts', () => {
        assert.ok(!NAMES_PATTERN.test('Sarah'));
        assert.ok(!NAMES_PATTERN.test('莎拉'));
        assert.ok(!NAMES_PATTERN.test('JOSÉ'));
    });

    it('allows one name its own limit, and a list room for numbering', () => {
        assert.equal(namesLimit(20, 1), 20);
        assert.equal(namesLimit(20, 3), 75);
    });
});
