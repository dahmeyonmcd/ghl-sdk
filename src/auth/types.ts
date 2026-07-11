/** The three token types GHL issues, matching `userType` on the OAuth token response. */
export type TokenType = 'Company' | 'Location';

/**
 * Security scheme an endpoint declares in its OpenAPI spec — tells the TokenResolver which
 * token it needs. `bearer`/`Location-Access` take either a location or agency token; the
 * `-Only` variants are strict about which one.
 */
export type SecurityScheme =
  | 'bearer'
  | 'Location-Access'
  | 'Location-Access-Only'
  | 'Agency-Access'
  | 'Agency-Access-Only'
  | 'none';

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  userType?: TokenType;
  locationId?: string;
  companyId?: string;
  approvedLocations?: string[];
  userId: string;
  planId?: string;
  isBulkInstallation?: boolean;
  installToFutureLocations?: boolean;
  approveAllLocations?: boolean;
}

export interface LocationTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  locationId?: string;
  planId?: string;
  userId: string;
  appId?: string;
  versionId?: string;
}

/** A single stored OAuth token (agency or location) with its expiry and refresh material. */
export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  tokenType: TokenType;
  /** Epoch ms when this token expires. */
  expiresAt: number;
  locationId?: string;
  companyId?: string;
  userId?: string;
  scope?: string;
}

/** Persisted OAuth session for one agency. Location tokens are cached per-locationId since they're derived from the agency token. */
export interface SessionData {
  companyId: string;
  agencyToken?: StoredToken;
  locationTokens: Record<string, StoredToken>;
}

/** Pluggable persistence for OAuth sessions — bring your own Redis/Postgres/etc adapter. */
export interface SessionStorage {
  get(companyId: string): Promise<SessionData | undefined>;
  set(companyId: string, data: SessionData): Promise<void>;
  delete(companyId: string): Promise<void>;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Must exactly match the redirect URI registered on the marketplace app. */
  redirectUri?: string;
}

/** Context describing which token a given request needs, derived from the endpoint's security scheme. */
export interface TokenRequestContext {
  scheme: SecurityScheme;
  locationId?: string;
  companyId?: string;
}

export interface ResolvedToken {
  accessToken: string;
  tokenType: TokenType;
}

/** Resolves the correct bearer token for a request based on its declared security scheme. */
export interface TokenResolver {
  resolve(context: TokenRequestContext): Promise<ResolvedToken>;
  /** Force-refresh whatever token was used for `context`, e.g. after a 401. Returns the new token. */
  refresh(context: TokenRequestContext): Promise<ResolvedToken>;
}
