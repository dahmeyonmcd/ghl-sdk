import { GhlTokenResolutionError } from '../http/errors.js';
import { getLocationToken } from './location-token.js';
import { OAuthFlow } from './oauth-flow.js';
import type {
  OAuthConfig,
  ResolvedToken,
  SessionData,
  SessionStorage,
  StoredToken,
  TokenRequestContext,
  TokenResolver,
} from './types.js';

const EXPIRY_SAFETY_MARGIN_MS = 30_000;

function isExpired(token: StoredToken): boolean {
  return Date.now() >= token.expiresAt - EXPIRY_SAFETY_MARGIN_MS;
}

function requiresAgencyToken(scheme: TokenRequestContext['scheme']): boolean {
  return scheme === 'Agency-Access' || scheme === 'Agency-Access-Only';
}

function requiresLocationToken(scheme: TokenRequestContext['scheme']): boolean {
  return scheme === 'Location-Access-Only';
}

/** Returns the same static PIT for every request. PITs are pre-scoped in the GHL dashboard, so we just trust it. */
export class StaticTokenResolver implements TokenResolver {
  constructor(private readonly token: string) {}

  async resolve(_context: TokenRequestContext): Promise<ResolvedToken> {
    return { accessToken: this.token, tokenType: 'Location' };
  }

  async refresh(_context: TokenRequestContext): Promise<ResolvedToken> {
    throw new GhlTokenResolutionError(
      'Received 401 using a static Private Integration Token — the token is invalid, revoked, or lacks the required scope for this endpoint. PITs cannot be auto-refreshed.',
    );
  }
}

export interface OAuthTokenResolverOptions {
  config: OAuthConfig;
  sessionStorage: SessionStorage;
  /** The agency/company this client instance operates for. */
  companyId: string;
}

/** Picks agency vs. location token per request. Agency tokens refresh via refresh_token; location tokens are derived from the agency token on first use and cached. */
export class OAuthTokenResolver implements TokenResolver {
  private readonly oauthFlow: OAuthFlow;
  private readonly sessionStorage: SessionStorage;
  private readonly companyId: string;
  private readonly locationTokenLocks = new Map<string, Promise<ResolvedToken>>();
  private agencyRefreshLock: Promise<ResolvedToken> | undefined;

  constructor(options: OAuthTokenResolverOptions) {
    this.oauthFlow = new OAuthFlow(options.config);
    this.sessionStorage = options.sessionStorage;
    this.companyId = options.companyId;
  }

  private async getSession(): Promise<SessionData> {
    const session = await this.sessionStorage.get(this.companyId);
    if (!session) {
      throw new GhlTokenResolutionError(
        `No OAuth session found for companyId "${this.companyId}". Complete the OAuth flow first (see OAuthFlow.getAuthorizationUrl / exchangeCode) and persist the result to sessionStorage.`,
      );
    }
    return session;
  }

  private async ensureAgencyToken(session: SessionData): Promise<ResolvedToken> {
    const agencyToken = session.agencyToken;
    if (!agencyToken) {
      throw new GhlTokenResolutionError(
        `No agency access token stored for companyId "${this.companyId}". This request requires an agency-level (Company) token.`,
      );
    }
    if (!isExpired(agencyToken)) {
      return { accessToken: agencyToken.accessToken, tokenType: agencyToken.tokenType };
    }
    return this.refreshAgencyToken(session);
  }

  private async refreshAgencyToken(session: SessionData): Promise<ResolvedToken> {
    if (this.agencyRefreshLock) return this.agencyRefreshLock;

    const doRefresh = async (): Promise<ResolvedToken> => {
      const current = session.agencyToken;
      if (!current?.refreshToken) {
        throw new GhlTokenResolutionError(
          `Agency token for companyId "${this.companyId}" is expired and no refresh_token is available. Re-run the OAuth authorization flow.`,
        );
      }
      const refreshed = await this.oauthFlow.refreshToken({
        refreshToken: current.refreshToken,
        userType: 'Company',
      });
      const stored: StoredToken = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? current.refreshToken,
        tokenType: 'Company',
        expiresAt: Date.now() + refreshed.expires_in * 1000,
        companyId: refreshed.companyId ?? this.companyId,
        userId: refreshed.userId,
        scope: refreshed.scope,
      };
      const next: SessionData = { ...session, agencyToken: stored };
      await this.sessionStorage.set(this.companyId, next);
      return { accessToken: stored.accessToken, tokenType: stored.tokenType };
    };

    this.agencyRefreshLock = doRefresh().finally(() => {
      this.agencyRefreshLock = undefined;
    });
    return this.agencyRefreshLock;
  }

  private async ensureLocationToken(session: SessionData, locationId: string): Promise<ResolvedToken> {
    const cached = session.locationTokens[locationId];
    if (cached && !isExpired(cached)) {
      return { accessToken: cached.accessToken, tokenType: cached.tokenType };
    }

    const existingLock = this.locationTokenLocks.get(locationId);
    if (existingLock) return existingLock;

    const doExchange = async (): Promise<ResolvedToken> => {
      const agency = await this.ensureAgencyToken(session);
      const exchanged = await getLocationToken({
        agencyAccessToken: agency.accessToken,
        companyId: this.companyId,
        locationId,
      });
      const stored: StoredToken = {
        accessToken: exchanged.access_token,
        tokenType: 'Location',
        expiresAt: Date.now() + exchanged.expires_in * 1000,
        locationId,
        companyId: this.companyId,
        userId: exchanged.userId,
        scope: exchanged.scope,
      };
      const latest = await this.getSession();
      const next: SessionData = {
        ...latest,
        locationTokens: { ...latest.locationTokens, [locationId]: stored },
      };
      await this.sessionStorage.set(this.companyId, next);
      return { accessToken: stored.accessToken, tokenType: stored.tokenType };
    };

    const lock = doExchange().finally(() => {
      this.locationTokenLocks.delete(locationId);
    });
    this.locationTokenLocks.set(locationId, lock);
    return lock;
  }

  async resolve(context: TokenRequestContext): Promise<ResolvedToken> {
    const session = await this.getSession();

    if (requiresAgencyToken(context.scheme)) {
      return this.ensureAgencyToken(session);
    }

    if (requiresLocationToken(context.scheme) || context.locationId) {
      if (!context.locationId) {
        throw new GhlTokenResolutionError(
          'This endpoint requires a location-scoped token but no locationId was provided in the request context.',
        );
      }
      return this.ensureLocationToken(session, context.locationId);
    }

    // scheme === 'bearer' | 'Location-Access' with no explicit locationId: fall back to agency token.
    return this.ensureAgencyToken(session);
  }

  async refresh(context: TokenRequestContext): Promise<ResolvedToken> {
    const session = await this.getSession();

    if (requiresAgencyToken(context.scheme) || !context.locationId) {
      return this.refreshAgencyToken(session);
    }

    // Location tokens have no refresh_token of their own — re-derive from the agency token.
    const next: SessionData = {
      ...session,
      locationTokens: Object.fromEntries(
        Object.entries(session.locationTokens).filter(([id]) => id !== context.locationId),
      ),
    };
    await this.sessionStorage.set(this.companyId, next);
    return this.ensureLocationToken(next, context.locationId);
  }
}
