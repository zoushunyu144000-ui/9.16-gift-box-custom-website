import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** A 256-bit key for one purpose, derived from a server secret so stolen data from one use can't open another. */
export function deriveKey(secret: string, purpose: string): Buffer {
    return createHash('sha256').update(`couriers-my:${purpose}:${secret}`).digest();
}

/** AES-256-GCM: confidential and tamper-evident. Output: base64url(iv | tag | ciphertext). */
export function seal(value: unknown, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

/** Undefined for anything not sealed with this key (wrong key, edited, truncated). */
export function unseal<T>(sealed: string | null | undefined, key: Buffer): T | undefined {
    if (!sealed) return undefined;
    try {
        const data = Buffer.from(sealed, 'base64url');
        if (data.length < 29) return undefined;
        const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
        decipher.setAuthTag(data.subarray(12, 28));
        const plain = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
        return JSON.parse(plain.toString('utf8')) as T;
    } catch {
        return undefined;
    }
}

export function hmacSha256Hex(key: string | Buffer, data: string): string {
    return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

/** Constant-time string comparison, so response timing doesn't reveal how much of a secret matched. */
export function safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) {
        timingSafeEqual(left, left);
        return false;
    }
    return timingSafeEqual(left, right);
}

/** PKCE (RFC 7636, S256): the verifier stays on the server, the challenge goes to the provider. */
export function pkcePair(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

export function randomToken(bytes = 16): string {
    return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
