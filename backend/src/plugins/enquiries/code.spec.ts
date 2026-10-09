import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CODE_ALPHABET, generateEnquiryCode, isEnquiryCode, uniqueEnquiryCode } from './code';

describe('enquiry codes', () => {
    it('look like ENQ-7G4K2, without characters that are easy to misread', () => {
        for (let i = 0; i < 200; i++) {
            const code = generateEnquiryCode('ENQ');
            assert.match(code, /^ENQ-[A-HJ-NP-Z2-9]{5}$/);
            assert.ok(isEnquiryCode(code, 'ENQ'));
        }
        assert.ok(!/[01OI]/.test(CODE_ALPHABET));
        assert.equal(new Set(CODE_ALPHABET).size, 32);
    });

    it('use every character of the alphabet', () => {
        assert.equal(generateEnquiryCode('ENQ', () => 0), 'ENQ-AAAAA');
        assert.equal(generateEnquiryCode('Q', max => max - 1), 'Q-99999');
        assert.ok(!isEnquiryCode('ENQ-0O1I2', 'ENQ'));
        assert.ok(!isEnquiryCode('ENQ-7G4K', 'ENQ'));
        assert.ok(!isEnquiryCode('MCQ-7G4K2', 'ENQ'));
    });

    it('draw again when a code is already taken', async () => {
        const drawn = ['ENQ-AAAAA', 'ENQ-BBBBB', 'ENQ-CCCCC'];
        const asked: string[] = [];
        const code = await uniqueEnquiryCode(
            'ENQ',
            async c => {
                asked.push(c);
                return c !== 'ENQ-CCCCC';
            },
            () => drawn.shift()!,
        );
        assert.equal(code, 'ENQ-CCCCC');
        assert.deepEqual(asked, ['ENQ-AAAAA', 'ENQ-BBBBB', 'ENQ-CCCCC']);
    });

    it('give up after a few attempts rather than loop for ever', async () => {
        let attempts = 0;
        await assert.rejects(
            uniqueEnquiryCode('ENQ', async () => (attempts++, true), undefined, 4),
            /after 4 attempts/,
        );
        assert.equal(attempts, 4);
    });
});
