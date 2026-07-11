import { AuthManager } from './auth/auth-manager.js';
import { InMemorySessionStorage } from './auth/session-storage.js';
import { OAuthTokenResolver, StaticTokenResolver } from './auth/token-resolver.js';
import type { OAuthConfig, SessionStorage, TokenResolver } from './auth/types.js';
import { GHL_API_VERSION, GHL_BASE_URL } from './constants.js';
import type { RateLimiterOptions } from './http/rate-limiter.js';
import type { RetryOptions } from './http/retry.js';
import { HttpTransport, type RequestInterceptor, type ResponseInterceptor } from './http/transport.js';
import { AgencyClient } from './enterprise/agency-client.js';
import { LocationsResource } from './resources/locations/index.js';
import { OAuthResource } from './resources/oauth/index.js';
import { attachGeneratedResources, type GeneratedResources } from './resources/generated.js';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

interface BaseGhlClientConfig {
  apiVersion?: string;
  baseUrl?: string;
  rateLimiter?: RateLimiterOptions | false;
  retry?: RetryOptions | false;
  onRequest?: RequestInterceptor;
  onResponse?: ResponseInterceptor;
  fetch?: typeof fetch;
  logLevel?: LogLevel;
}

export interface PitGhlClientConfig extends BaseGhlClientConfig {
  /** Private Integration Token — static bearer, no OAuth session required. */
  privateIntegrationToken: string;
  clientId?: undefined;
  clientSecret?: undefined;
}

export interface OAuthGhlClientConfig extends BaseGhlClientConfig, OAuthConfig {
  privateIntegrationToken?: undefined;
  /** The agency/company this client instance operates for. Required for agency + location-scoped calls. */
  companyId?: string;
  /** Defaults to {@link InMemorySessionStorage}; swap in a Redis/Postgres/etc adapter for anything beyond a single process. */
  sessionStorage?: SessionStorage;
}

export type GhlClientConfig = PitGhlClientConfig | OAuthGhlClientConfig;

function isOAuthConfig(config: GhlClientConfig): config is OAuthGhlClientConfig {
  return !config.privateIntegrationToken;
}

/**
 * Root SDK entrypoint. Construct with a Private Integration Token or an OAuth app's
 * `clientId`/`clientSecret`, then call resources directly (`ghl.locations`, `ghl.contacts`, ...).
 *
 * @example
 * ```ts
 * const ghl = new GhlClient({ privateIntegrationToken: process.env.GHL_PIT! });
 * const { location } = await ghl.locations.get(locationId);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- merged with `interface GhlClient extends GeneratedResources` below by design.
export class GhlClient {
  readonly auth: AuthManager;
  readonly locations: LocationsResource;
  readonly oauth: OAuthResource;

  private readonly transport: HttpTransport;
  private readonly tokenResolver: TokenResolver;
  private readonly sessionStorage: SessionStorage | undefined;
  private readonly companyId: string | undefined;

  constructor(config: GhlClientConfig) {
    if (isOAuthConfig(config)) {
      if (!config.clientId || !config.clientSecret) {
        throw new Error('GhlClient requires either `privateIntegrationToken` or both `clientId` and `clientSecret`.');
      }
      this.sessionStorage = config.sessionStorage ?? new InMemorySessionStorage();
      this.companyId = config.companyId;
      this.tokenResolver = config.companyId
        ? new OAuthTokenResolver({
            config: { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri },
            sessionStorage: this.sessionStorage,
            companyId: config.companyId,
          })
        : new DeferredOAuthTokenResolver(
            { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri },
            this.sessionStorage,
          );
      this.auth = new AuthManager({
        oauthConfig: { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri },
        sessionStorage: this.sessionStorage,
        companyId: config.companyId,
        tokenResolver: this.tokenResolver,
      });
    } else {
      this.tokenResolver = new StaticTokenResolver(config.privateIntegrationToken);
      this.auth = new AuthManager({ tokenResolver: this.tokenResolver });
    }

    this.transport = new HttpTransport({
      tokenResolver: this.tokenResolver,
      baseUrl: config.baseUrl ?? GHL_BASE_URL,
      apiVersion: config.apiVersion ?? GHL_API_VERSION,
      rateLimiter: config.rateLimiter,
      retry: config.retry,
      onRequest: config.onRequest,
      onResponse: config.onResponse,
      fetch: config.fetch,
    });

    this.locations = new LocationsResource(this.transport);
    this.oauth = new OAuthResource(this.transport);
    Object.assign(this, attachGeneratedResources(this.transport));
  }

  /** Raw transport, for resource clients that need it directly. */
  getTransport(): HttpTransport {
    return this.transport;
  }

  /** Multi-location facade for iterating every location an agency app is installed on. Needs an OAuth client with an agency session — a PIT client can't list sub-accounts. */
  asAgency(options: { appId: string; companyId?: string }): AgencyClient {
    const companyId = options.companyId ?? this.companyId;
    if (!companyId) {
      throw new Error('asAgency() requires `companyId`, either passed here or on the GhlClient constructor.');
    }
    return new AgencyClient({
      companyId,
      appId: options.appId,
      transport: this.transport,
      auth: this.auth,
    });
  }
}

// Generated resources (ghl.contacts, ghl.opportunities, ...) are attached via Object.assign in the
// constructor above; this merge is what gives them types without editing this file per module.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface GhlClient extends GeneratedResources {}

// Lets you construct a GhlClient before companyId is known (e.g. before the OAuth callback
// lands) by resolving a per-companyId resolver lazily per request. Multi-tenant apps should
// switch to one client per companyId once it's known.
class DeferredOAuthTokenResolver implements TokenResolver {
  private readonly resolvers = new Map<string, OAuthTokenResolver>();

  constructor(
    private readonly config: OAuthConfig,
    private readonly sessionStorage: SessionStorage,
  ) {}

  private forCompany(companyId: string): OAuthTokenResolver {
    let resolver = this.resolvers.get(companyId);
    if (!resolver) {
      resolver = new OAuthTokenResolver({ config: this.config, sessionStorage: this.sessionStorage, companyId });
      this.resolvers.set(companyId, resolver);
    }
    return resolver;
  }

  async resolve(context: Parameters<TokenResolver['resolve']>[0]) {
    if (!context.companyId) {
      throw new Error(
        'This GhlClient was constructed without a `companyId`. Pass `companyId` explicitly on the request, or construct a client per-companyId once the OAuth callback resolves it.',
      );
    }
    return this.forCompany(context.companyId).resolve(context);
  }

  async refresh(context: Parameters<TokenResolver['refresh']>[0]) {
    if (!context.companyId) {
      throw new Error(
        'This GhlClient was constructed without a `companyId`. Pass `companyId` explicitly on the request, or construct a client per-companyId once the OAuth callback resolves it.',
      );
    }
    return this.forCompany(context.companyId).refresh(context);
  }
}
