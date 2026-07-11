import { createHash, randomBytes } from 'node:crypto';
import { GHL_AUTHORIZE_URL, GHL_BASE_URL, GHL_WHITELABEL_AUTHORIZE_URL } from '../constants.js';
import { GhlError } from '../http/errors.js';
import type { OAuthConfig, OAuthTokenResponse, TokenType } from './types.js';

export interface AuthorizationUrlOptions {
  /** Space-delimited scope string, e.g. "conversations/message.readonly locations.readonly". */
  scope: string;
  /** Overrides `redirectUri` from the OAuth config for this specific auth request. */
  redirectUri?: string;
  /** Opaque value round-tripped by GHL, use to prevent CSRF and to correlate the callback. */
  state?: string;
  /** Use the white-labeled marketplace.leadconnectorhq.com host instead of marketplace.gohighlevel.com. */
  whiteLabel?: boolean;
  /** Force the login prompt to open in the same tab rather than a new one. */
  loginWindowOpenModeSelf?: boolean;
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface ExchangeCodeOptions {
  code: string;
  redirectUri?: string;
  userType?: TokenType;
}

export interface RefreshTokenOptions {
  refreshToken: string;
  userType?: TokenType;
}

/** Stateless OAuth 2.0 calls — auth URL, code exchange, refresh. Doesn't touch session storage; callers persist the result themselves. */
export class OAuthFlow {
  constructor(private readonly config: OAuthConfig) {}

  /** Generates a PKCE code_verifier/code_challenge pair (S256) for the authorization code flow. */
  static generatePkce(): PkcePair {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  /** Builds the marketplace `chooselocation` authorization URL for redirecting a user to grant access. */
  getAuthorizationUrl(options: AuthorizationUrlOptions): string {
    const redirectUri = options.redirectUri ?? this.config.redirectUri;
    if (!redirectUri) {
      throw new Error('redirectUri must be provided either in OAuthConfig or AuthorizationUrlOptions');
    }

    const base = options.whiteLabel ? GHL_WHITELABEL_AUTHORIZE_URL : GHL_AUTHORIZE_URL;
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: redirectUri,
      client_id: this.config.clientId,
      scope: options.scope,
    });
    if (options.state) params.set('state', options.state);
    if (options.loginWindowOpenModeSelf) params.set('loginWindowOpenMode', 'self');

    return `${base}?${params.toString()}`;
  }

  /** Exchanges an authorization code (from the OAuth callback) for an access + refresh token pair. */
  async exchangeCode(options: ExchangeCodeOptions): Promise<OAuthTokenResponse> {
    const redirectUri = options.redirectUri ?? this.config.redirectUri;
    if (!redirectUri) {
      throw new Error('redirectUri must be provided either in OAuthConfig or ExchangeCodeOptions');
    }

    return this.requestToken({
      grant_type: 'authorization_code',
      code: options.code,
      redirect_uri: redirectUri,
      ...(options.userType ? { user_type: options.userType } : {}),
    });
  }

  /** Exchanges a refresh token for a new access token. */
  async refreshToken(options: RefreshTokenOptions): Promise<OAuthTokenResponse> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: options.refreshToken,
      ...(options.userType ? { user_type: options.userType } : {}),
    });
  }

  private async requestToken(fields: Record<string, string>): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...fields,
    });

    const response = await fetch(`${GHL_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    const json = (await response.json().catch(() => undefined)) as OAuthTokenResponse | undefined;

    if (!response.ok || !json) {
      throw GhlError.fromResponse(response, json as unknown as Record<string, unknown>, {
        method: 'POST',
        url: `${GHL_BASE_URL}/oauth/token`,
      });
    }

    return json;
  }
}
