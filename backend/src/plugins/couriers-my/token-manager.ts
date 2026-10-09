import { EasyParcelTokens } from './clients/easyparcel';

export interface TokenStore {
    load(key: string): Promise<EasyParcelTokens | undefined>;
    save(key: string, tokens: EasyParcelTokens): Promise<void>;
}

export class NotConnectedError extends Error {
    constructor(message = 'EasyParcel is not connected. An admin needs to open /delivery/easyparcel/connect.') {
        super(message);
        this.name = 'NotConnectedError';
    }
}

/** Refresh this long before expiry, so a token never expires mid-request. */
export const DEFAULT_REFRESH_MARGIN_MS = 5 * 60_000;

export function expiresWithin(tokens: Pick<EasyParcelTokens, 'expiresAt'>, now: number, marginMs: number): boolean {
    if (!tokens.expiresAt) return false;
    return new Date(tokens.expiresAt).getTime() - marginMs <= now;
}

export function isExpired(tokens: Pick<EasyParcelTokens, 'expiresAt'>, now: number): boolean {
    return expiresWithin(tokens, now, 0);
}

/**
 * Hands out access tokens, refreshing them shortly before they expire. One refresh at a time per key in
 * this process; when a refresh fails (e.g. the worker already used a rotated refresh token), the stored
 * tokens are read again and used if another process refreshed them.
 */
export class TokenManager {
    private inFlight = new Map<string, Promise<string>>();

    constructor(
        private readonly store: TokenStore,
        private readonly refreshTokens: (refreshToken: string) => Promise<EasyParcelTokens>,
        private readonly now: () => number = Date.now,
        private readonly marginMs = DEFAULT_REFRESH_MARGIN_MS,
    ) {}

    async getAccessToken(key: string, options: { forceRefresh?: boolean; marginMs?: number } = {}): Promise<string> {
        const tokens = await this.store.load(key);
        if (!tokens) throw new NotConnectedError();
        const margin = options.marginMs ?? this.marginMs;
        if (!options.forceRefresh && !expiresWithin(tokens, this.now(), margin)) return tokens.accessToken;
        if (!tokens.refreshToken) {
            if (!isExpired(tokens, this.now()) && !options.forceRefresh) return tokens.accessToken;
            throw new NotConnectedError('The EasyParcel connection has expired. An admin needs to reconnect it.');
        }
        const running = this.inFlight.get(key);
        if (running) return running;
        const refresh = this.refresh(key, tokens, !!options.forceRefresh).finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, refresh);
        return refresh;
    }

    private async refresh(key: string, current: EasyParcelTokens, forced: boolean): Promise<string> {
        try {
            const next = await this.refreshTokens(current.refreshToken!);
            // Some servers don't rotate refresh tokens; keep the old one then.
            const merged: EasyParcelTokens = {
                ...next,
                refreshToken: next.refreshToken || current.refreshToken,
                refreshTokenExpiresAt: next.refreshTokenExpiresAt ?? current.refreshTokenExpiresAt,
            };
            await this.store.save(key, merged);
            return merged.accessToken;
        } catch (error) {
            const latest = await this.store.load(key);
            if (latest && latest.accessToken !== current.accessToken && !isExpired(latest, this.now())) return latest.accessToken;
            // A routine early refresh can wait for the next call; a forced one (after a 401) can't.
            if (!forced && !isExpired(current, this.now())) return current.accessToken;
            throw error;
        }
    }
}
