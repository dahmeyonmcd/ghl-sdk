import { GhlTokenResolutionError } from '../http/errors.js';
import { OAuthFlow, type AuthorizationUrlOptions, type PkcePair } from './oauth-flow.js';
import { OAuthTokenResolver } from './token-resolver.js';
import type {
  OAuthConfig,
  OAuthTokenResponse,
  SessionData,
  SessionStorage,
  StoredToken,
  TokenResolver,
} from './types.js';

export interface AuthManagerOptions {
  oauthConfig?: OAuthConfig;
  sessionStorage?: SessionStorage;
  companyId?: string;
  tokenResolver: TokenResolver;
}

/** The `ghl.auth` surface: authorization URLs, code exchange, and location token lookup on top of the configured session storage. */
export class AuthManager {
  private readonly oauthFlow: OAuthFlow | undefined;
  private readonly sessionStorage: SessionStorage | undefined;
  private readonly companyId: string | undefined;
  private readonly tokenResolver: TokenResolver;

  constructor(options: AuthManagerOptions) {
    this.oauthFlow = options.oauthConfig ? new OAuthFlow(options.oauthConfig) : undefined;
    this.sessionStorage = options.sessionStorage;
    this.companyId = options.companyId;
    this.tokenResolver = options.tokenResolver;
  }

  private requireOAuthFlow(): OAuthFlow {
    if (!this.oauthFlow) {
      throw new Error(
        'OAuth is not configured on this client. Pass `clientId`/`clientSecret` (and optionally `redirectUri`) to GhlClient to use authorization-code OAuth flows.',
      );
    }
    return this.oauthFlow;
  }

  /** Generates a PKCE code_verifier/code_challenge pair for the authorization code flow. */
  static generatePkce(): PkcePair {
    return OAuthFlow.generatePkce();
  }

  /** Builds the marketplace authorization URL to redirect a user to for consent. */
  getAuthorizationUrl(options: AuthorizationUrlOptions): string {
    return this.requireOAuthFlow().getAuthorizationUrl(options);
  }

  /** Exchanges an auth code for tokens, persists them, and returns the raw response for anything not cached (e.g. `approvedLocations`). */
  async exchangeCode(code: string, redirectUri?: string): Promise<OAuthTokenResponse> {
    const flow = this.requireOAuthFlow();
    const token = await flow.exchangeCode({ code, redirectUri });
    await this.persistToken(token);
    return token;
  }

  private async persistToken(token: OAuthTokenResponse): Promise<void> {
    if (!this.sessionStorage) return;
    const companyId = token.companyId ?? this.companyId;
    if (!companyId) return;

    const existing = (await this.sessionStorage.get(companyId)) ?? { companyId, locationTokens: {} };
    const stored: StoredToken = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenType: token.userType ?? 'Company',
      expiresAt: Date.now() + token.expires_in * 1000,
      locationId: token.locationId,
      companyId,
      userId: token.userId,
      scope: token.scope,
    };

    const next: SessionData =
      stored.tokenType === 'Location' && token.locationId
        ? { ...existing, locationTokens: { ...existing.locationTokens, [token.locationId]: stored } }
        : { ...existing, agencyToken: stored };

    await this.sessionStorage.set(companyId, next);
  }

  /** Returns a location access token, deriving and caching it from the agency token if needed. OAuth clients only. */
  async getLocationToken(locationId: string): Promise<string> {
    if (!(this.tokenResolver instanceof OAuthTokenResolver)) {
      throw new GhlTokenResolutionError(
        'getLocationToken requires an OAuth-configured GhlClient (clientId/clientSecret + sessionStorage), not a static Private Integration Token.',
      );
    }
    const resolved = await this.tokenResolver.resolve({ scheme: 'Location-Access-Only', locationId });
    return resolved.accessToken;
  }
}
