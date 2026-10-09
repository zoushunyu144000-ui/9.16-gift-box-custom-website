import { randomInt } from 'crypto';

/** No 0/O or 1/I, so a code read out over the phone or typed from a screenshot comes out right. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

/** A short reference such as ENQ-7G4K2 (32^5 ≈ 33 million combinations). */
export function generateEnquiryCode(prefix: string, random: (max: number) => number = randomInt) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[random(CODE_ALPHABET.length)];
    return `${prefix}-${code}`;
}

export function isEnquiryCode(value: string, prefix: string) {
    return new RegExp(`^${prefix.replace(/[^A-Za-z0-9]/g, '')}-[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}

/**
 * Draws codes until one is free. A clash is very unlikely, so a few attempts are plenty; the database's
 * unique index on the code is the final guard.
 */
export async function uniqueEnquiryCode(
    prefix: string,
    isTaken: (code: string) => Promise<boolean>,
    generate: (prefix: string) => string = generateEnquiryCode,
    attempts = 10,
): Promise<string> {
    for (let i = 0; i < attempts; i++) {
        const code = generate(prefix);
        if (!(await isTaken(code))) return code;
    }
    throw new Error(`Could not find a free enquiry code after ${attempts} attempts`);
}
