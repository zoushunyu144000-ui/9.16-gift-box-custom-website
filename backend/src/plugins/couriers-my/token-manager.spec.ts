import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EasyParcelTokens } from './clients/easyparcel';
import { deriveKey, pkcePair, safeEqual, seal, unseal } from './crypto';
import { expiresWithin, NotConnectedError, TokenManager, TokenStore } from './token-manager';

const NOW = Date.parse('2026-10-09T08:00:00Z');
const minutes = (n: number) => new Date(NOW + n * 60_000);

function memoryStore(initial?: EasyParcelTokens) {
    const data = new Map<string, EasyParcelTokens>();
    if (initial) data.set('1', initial);
    const store: TokenStore & { saves: number } = {
        saves: 0,
        load: async key => data.get(key),
        save: async (key, tokens) => {
            store.saves++;
            data.set(key, tokens);
        },
    };
    return { store, data };
}

describe('EasyParcel token refresh', () => {
    it('uses the stored token while it is valid', async () => {
        const { store } = memoryStore({ accessToken: 'a1', refreshToken: 'r1', expiresAt: minutes(60) });
        let refreshes = 0;
        const manager = new TokenManager(store, async () => {
            refreshes++;
            return { accessToken: 'a2' };
        }, () => NOW);
        assert.equal(await manager.getAccessToken('1'), 'a1');
        assert.equal(refreshes, 0);
    });

    it('refreshes shortly before expiry and keeps an unrotated refresh token', async () => {
        const { store, data } = memoryStore({ accessToken: 'a1', refreshToken: 'r1', expiresAt: minutes(3), refreshTokenExpiresAt: minutes(60 * 24 * 300) });
        const manager = new TokenManager(store, async refreshToken => {
            assert.equal(refreshToken, 'r1');
            return { accessToken: 'a2', expiresAt: minutes(600) };
        }, () => NOW);
        assert.equal(await manager.getAccessToken('1'), 'a2');
        assert.equal(data.get('1')?.refreshToken, 'r1');
        assert.equal(data.get('1')?.refreshTokenExpiresAt?.getTime(), minutes(60 * 24 * 300).getTime());
    });

    it('refreshes once for concurrent callers', async () => {
        const { store } = memoryStore({ accessToken: 'a1', refreshToken: 'r1', expiresAt: minutes(-1) });
        let refreshes = 0;
        const manager = new TokenManager(store, async () => {
            refreshes++;
            await new Promise(resolve => setTimeout(resolve, 10));
            return { accessToken: 'a2', refreshToken: 'r2', expiresAt: minutes(600) };
        }, () => NOW);
        const tokens = await Promise.all([manager.getAccessToken('1'), manager.getAccessToken('1'), manager.getAccessToken('1')]);
        assert.deepEqual(tokens, ['a2', 'a2', 'a2']);
        assert.equal(refreshes, 1);
        assert.equal(store.saves, 1);
    });

    it('uses tokens another process refreshed when its own refresh fails', async () => {
        const { store, data } = memoryStore({ accessToken: 'a1', refreshToken: 'r1', expiresAt: minutes(-1) });
        const manager = new TokenManager(store, async () => {
            // The worker rotated the refresh token first, so this refresh is refused.
            data.set('1', { accessToken: 'a-worker', refreshToken: 'r-worker', expiresAt: minutes(600) });
            throw new Error('invalid_grant');
        }, () => NOW);
        assert.equal(await manager.getAccessToken('1'), 'a-worker');
    });

    it('keeps a still-valid token when an early refresh fails, but not after a 401', async () => {
        const { store } = memoryStore({ accessToken: 'a1', refreshToken: 'r1', expiresAt: minutes(2) });
        const manager = new TokenManager(store, async () => {
            throw new Error('EasyParcel is down');
        }, () => NOW);
        assert.equal(await manager.getAccessToken('1'), 'a1');
        await assert.rejects(() => manager.getAccessToken('1', { forceRefresh: true }), /EasyParcel is down/);
    });

    it('reports a missing or expired connection', async () => {
        await assert.rejects(() => new TokenManager(memoryStore().store, async () => ({ accessToken: 'x' })).getAccessToken('1'), NotConnectedError);
        const { store } = memoryStore({ accessToken: 'a1', refreshToken: null, expiresAt: minutes(-5) });
        await assert.rejects(() => new TokenManager(store, async () => ({ accessToken: 'x' }), () => NOW).getAccessToken('1'), NotConnectedError);
    });

    it('treats tokens without an expiry as valid until the API says otherwise', () => {
        assert.ok(!expiresWithin({ expiresAt: null }, NOW, 60_000));
        assert.ok(expiresWithin({ expiresAt: minutes(1) }, NOW, 5 * 60_000));
    });
});

describe('sealed values', () => {
    it('round-trips and detects tampering or the wrong key', () => {
        const key = deriveKey('client-secret', 'tokens');
        const sealed = seal({ accessToken: 'secret-token' }, key);
        assert.ok(!sealed.includes('secret-token'));
        assert.deepEqual(unseal(sealed, key), { accessToken: 'secret-token' });
        assert.equal(unseal(sealed, deriveKey('client-secret', 'oauth-state')), undefined);
        const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
        assert.equal(unseal(tampered, key), undefined);
        assert.equal(unseal('garbage', key), undefined);
    });

    it('compares secrets in constant time and makes PKCE pairs', () => {
        assert.ok(safeEqual('abc', 'abc'));
        assert.ok(!safeEqual('abc', 'abd'));
        assert.ok(!safeEqual('abc', 'abcd'));
        const { verifier, challenge } = pkcePair();
        assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
        assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
    });
});
