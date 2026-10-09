import { Inject, Injectable } from '@nestjs/common';
import { ChannelService, ID, idsAreEqual, Logger, Order, Permission, RequestContext, TransactionalConnection } from '@vendure/core';
import { LessThan } from 'typeorm';
import { EasyParcelApi, EasyParcelOAuth, EasyParcelTokens } from '../clients/easyparcel';
import { COURIERS_OPTIONS, EASYPARCEL_CALLBACK_PATH, EASYPARCEL_WEBHOOK_PATH, loggerCtx } from '../constants';
import { deriveKey, pkcePair, randomToken, seal, unseal } from '../crypto';
import { EasyParcelConnection } from '../entities/easyparcel-connection.entity';
import { ResolvedCouriersOptions } from '../options';
import { NotConnectedError, TokenManager, TokenStore } from '../token-manager';
import { ordersByFulfillment, ownChannel } from './fulfillment-orders';

/** What the OAuth `state` carries through the merchant's browser, sealed so it can't be read or forged. */
interface OAuthState {
    /** Channel the account is connected to. */
    c: string;
    /** Administrator who started the connection. */
    u: string;
    /** PKCE verifier. */
    v: string;
    /** Expiry, ms. */
    e: number;
    n: string;
}

interface SealedTokens {
    a: string;
    r?: string | null;
}

export class OAuthStateError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}

/**
 * Connects a channel's EasyParcel merchant account to our developer app (OAuth 2.0 authorization code
 * with PKCE) and keeps its tokens fresh. Tokens are only ever used for API calls from this server.
 */
@Injectable()
export class EasyParcelAuthService {
    private readonly tokenKey: Buffer;
    private readonly stateKey: Buffer;
    private readonly tokens: TokenManager;

    constructor(
        private connection: TransactionalConnection,
        private channelService: ChannelService,
        @Inject(COURIERS_OPTIONS) private options: ResolvedCouriersOptions,
    ) {
        this.tokenKey = deriveKey(options.easyParcel.clientSecret, 'easyparcel-tokens');
        this.stateKey = deriveKey(options.easyParcel.clientSecret, 'easyparcel-oauth-state');
        this.tokens = new TokenManager(
            this.store(),
            refreshToken => this.oauth().refresh(refreshToken, this.redirectUri()),
            Date.now,
            undefined,
            (channelId, error) => Logger.warn(`Refreshing the EasyParcel token of channel ${channelId} failed: ${(error as Error).message}`, loggerCtx),
        );
    }

    get configured(): boolean {
        return this.options.easyParcel.configured;
    }

    redirectUri(): string {
        return `${this.options.publicUrl}${EASYPARCEL_CALLBACK_PATH}`;
    }

    webhookSecret(): string {
        return this.options.easyParcel.webhookSecret;
    }

    webhookUrl(): string | undefined {
        const secret = this.webhookSecret();
        return secret ? `${this.options.publicUrl}${EASYPARCEL_WEBHOOK_PATH}/${secret}` : undefined;
    }

    /** The provider's authorise URL for the request's channel; the state expires after 15 minutes. */
    authorizeUrl(ctx: RequestContext): string {
        const { verifier, challenge } = pkcePair();
        const state: OAuthState = {
            c: String(ctx.channelId),
            u: String(ctx.activeUserId ?? ''),
            v: verifier,
            e: Date.now() + 15 * 60_000,
            n: randomToken(8),
        };
        return this.oauth().authorizeUrl({ redirectUri: this.redirectUri(), state: seal(state, this.stateKey), codeChallenge: challenge });
    }

    /**
     * Exchanges the code from the callback and stores the tokens for the channel that started the flow.
     * EasyParcel's redirect can't carry a channel token, so the checks don't use the request's channel: the
     * signed-in administrator must be the one who started (sealed in the state) and still hold UpdateSettings
     * on the state's channel.
     */
    async completeAuthorization(ctx: RequestContext, code: string, sealedState: string): Promise<{ channelId: string }> {
        const state = unseal<OAuthState>(sealedState, this.stateKey);
        if (!state || state.e < Date.now()) {
            throw new OAuthStateError('This EasyParcel connection link is invalid or has expired. Please start again from /delivery/easyparcel/connect.');
        }
        const user = ctx.session?.user;
        if (!user || !state.u || state.u !== String(user.id)) {
            throw new OAuthStateError('Please sign in to the dashboard in this browser as the administrator who started connecting EasyParcel, then start again.', 403);
        }
        const permissions = user.channelPermissions.find(channel => idsAreEqual(channel.id, state.c))?.permissions ?? [];
        if (!permissions.includes(Permission.UpdateSettings)) {
            throw new OAuthStateError('You need permission to update settings on this channel to connect EasyParcel.', 403);
        }
        const tokens = await this.oauth().exchangeCode({ code, redirectUri: this.redirectUri(), codeVerifier: state.v });
        await this.saveTokens(state.c, tokens, state.u || null);
        Logger.info(`EasyParcel account connected for channel ${state.c}`, loggerCtx);
        return { channelId: state.c };
    }

    /** A valid access token for the channel's connection; `refresh` forces a new one (after a 401). */
    accessToken(channelId: string, refresh = false): Promise<string> {
        return this.tokens.getAccessToken(channelId, { forceRefresh: refresh });
    }

    api(channelId: string): EasyParcelApi {
        return new EasyParcelApi({
            baseUrl: this.options.easyParcel.baseUrl,
            apiVersion: this.options.easyParcel.apiVersion,
            fetch: this.options.fetch,
            accessToken: refresh => this.accessToken(channelId, refresh),
        });
    }

    /** The account an order's shipments use: its own channel's connection, else the default channel's. */
    async accountForOrders(orders: Array<Pick<Order, 'channels'>>): Promise<string> {
        return this.connectionChannelId(ownChannel(orders, await this.channelService.getDefaultChannel()).id);
    }

    async accountForFulfillment(fulfillmentId: ID): Promise<string> {
        return this.accountForOrders((await ordersByFulfillment(this.connection, [fulfillmentId])).get(String(fulfillmentId)) ?? []);
    }

    /** The channel whose connection serves this channel: its own, else the default channel's. */
    async connectionChannelId(channelId: ID): Promise<string> {
        if (!this.configured) throw new NotConnectedError('EasyParcel is not configured: set EASYPARCEL_CLIENT_ID and EASYPARCEL_CLIENT_SECRET.');
        const repository = this.connection.rawConnection.getRepository(EasyParcelConnection);
        if (await repository.findOne({ where: { channelId: String(channelId) } })) return String(channelId);
        const defaultChannel = await this.channelService.getDefaultChannel();
        if (await repository.findOne({ where: { channelId: String(defaultChannel.id) } })) return String(defaultChannel.id);
        throw new NotConnectedError();
    }

    async status(ctx: RequestContext) {
        const row = await this.connection.rawConnection.getRepository(EasyParcelConnection).findOne({ where: { channelId: String(ctx.channelId) } });
        const readable = row ? !!unseal<SealedTokens>(row.sealedTokens, this.tokenKey) : false;
        return {
            configured: this.configured,
            environment: this.options.easyParcel.sandbox ? 'sandbox' : 'live',
            connected: !!row && readable,
            // Tokens sealed with a different client secret can't be used; the account must be connected again.
            needsReconnect: !!row && !readable,
            channelId: String(ctx.channelId),
            connectedAt: row?.createdAt ?? null,
            accessTokenExpiresAt: row?.expiresAt ?? null,
            refreshTokenExpiresAt: row?.refreshTokenExpiresAt ?? null,
            lastRefreshedAt: row?.lastRefreshedAt ?? null,
            redirectUri: this.redirectUri(),
            webhookUrl: this.webhookUrl() ?? null,
        };
    }

    async disconnect(ctx: RequestContext): Promise<boolean> {
        const result = await this.connection.rawConnection.getRepository(EasyParcelConnection).delete({ channelId: String(ctx.channelId) });
        return !!result.affected;
    }

    /**
     * Refreshes connections whose access token expires within `withinMs` (run by the reconcile task every
     * 30 minutes), so an idle shop's connection never lapses. API calls refresh on their own as well.
     */
    async refreshExpiring(withinMs = 3600_000): Promise<number> {
        if (!this.configured) return 0;
        const rows = await this.connection.rawConnection
            .getRepository(EasyParcelConnection)
            .find({ where: { expiresAt: LessThan(new Date(Date.now() + withinMs)) } });
        let refreshed = 0;
        for (const row of rows) {
            try {
                // Forced, so a failure surfaces here (and in the count) instead of falling back to the old token.
                await this.tokens.getAccessToken(row.channelId, { forceRefresh: true });
                refreshed++;
            } catch (error) {
                // Failed refreshes are logged by the token manager; a connection without a refresh token here.
                if (error instanceof NotConnectedError) Logger.warn(`EasyParcel (channel ${row.channelId}): ${error.message}`, loggerCtx);
            }
        }
        return refreshed;
    }

    private oauth(): EasyParcelOAuth {
        if (!this.configured) throw new NotConnectedError('EasyParcel is not configured: set EASYPARCEL_CLIENT_ID and EASYPARCEL_CLIENT_SECRET.');
        return new EasyParcelOAuth({
            baseUrl: this.options.easyParcel.baseUrl,
            clientId: this.options.easyParcel.clientId,
            clientSecret: this.options.easyParcel.clientSecret,
            fetch: this.options.fetch,
        });
    }

    /** Raw connection on purpose: a refreshed token must be kept even if the request's transaction rolls back. */
    private store(): TokenStore {
        const repository = () => this.connection.rawConnection.getRepository(EasyParcelConnection);
        return {
            load: async channelId => {
                const row = await repository().findOne({ where: { channelId } });
                if (!row) return undefined;
                const sealed = unseal<SealedTokens>(row.sealedTokens, this.tokenKey);
                if (!sealed) {
                    Logger.warn('Stored EasyParcel tokens cannot be read (was EASYPARCEL_CLIENT_SECRET changed?). Reconnect the account.', loggerCtx);
                    return undefined;
                }
                return { accessToken: sealed.a, refreshToken: sealed.r, expiresAt: row.expiresAt, refreshTokenExpiresAt: row.refreshTokenExpiresAt };
            },
            save: (channelId, tokens) => this.saveTokens(channelId, tokens, undefined, true),
        };
    }

    private async saveTokens(channelId: string, tokens: EasyParcelTokens, userId: string | null | undefined, refreshed = false): Promise<void> {
        const repository = this.connection.rawConnection.getRepository(EasyParcelConnection);
        const sealedTokens = seal({ a: tokens.accessToken, r: tokens.refreshToken ?? null } satisfies SealedTokens, this.tokenKey);
        const existing = await repository.findOne({ where: { channelId } });
        const values = {
            sealedTokens,
            expiresAt: tokens.expiresAt ?? null,
            refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? null,
            lastRefreshedAt: refreshed ? new Date() : null,
            ...(userId !== undefined ? { connectedByUserId: userId } : {}),
        };
        if (existing) await repository.update(existing.id, values);
        else await repository.save(new EasyParcelConnection({ channelId, ...values }));
    }
}
