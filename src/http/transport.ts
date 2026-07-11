import type { TokenResolver } from '../auth/types.js';
import { GHL_API_VERSION, GHL_BASE_URL } from '../constants.js';
import { GhlError, GhlNetworkError, type GhlErrorBody } from './errors.js';
import { RateLimiter, type RateLimiterOptions } from './rate-limiter.js';
import { withRetry, type RetryOptions } from './retry.js';
import type { SecurityScheme } from '../auth/types.js';

export type RequestInterceptor = (init: PreparedRequest) => void | Promise<void>;
export type ResponseInterceptor = (response: Response, init: PreparedRequest) => void | Promise<void>;

export interface PreparedRequest {
  method: string;
  url: string;
  headers: Headers;
  body?: BodyInit;
}

export interface RequestOptions {
  method: string;
  path: string;
  /** Security scheme declared by the endpoint's OpenAPI spec; drives token selection. */
  securityScheme?: SecurityScheme;
  query?: Record<string, string | number | boolean | undefined | null | Array<string | number>>;
  body?: unknown;
  locationId?: string;
  companyId?: string;
  headers?: Record<string, string>;
  /** Set false to send the raw body as-is (e.g. form-urlencoded) instead of JSON-encoding it. */
  json?: boolean;
  signal?: AbortSignal;
}

export interface HttpTransportOptions {
  tokenResolver: TokenResolver;
  baseUrl?: string;
  apiVersion?: string;
  rateLimiter?: RateLimiterOptions | false;
  retry?: RetryOptions | false;
  onRequest?: RequestInterceptor;
  onResponse?: ResponseInterceptor;
  fetch?: typeof fetch;
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${baseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/** Fetch wrapper every resource client shares: auth headers, rate limiting, retries, and a single 401-refresh-and-retry. */
export class HttpTransport {
  private readonly tokenResolver: TokenResolver;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly rateLimiter: RateLimiter | undefined;
  private readonly retryOptions: RetryOptions | false;
  private readonly onRequest: RequestInterceptor | undefined;
  private readonly onResponse: ResponseInterceptor | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpTransportOptions) {
    this.tokenResolver = options.tokenResolver;
    this.baseUrl = options.baseUrl ?? GHL_BASE_URL;
    this.apiVersion = options.apiVersion ?? GHL_API_VERSION;
    this.rateLimiter = options.rateLimiter === false ? undefined : new RateLimiter(options.rateLimiter);
    this.retryOptions = options.retry ?? {};
    this.onRequest = options.onRequest;
    this.onResponse = options.onResponse;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const exec = () => this.executeOnce<T>(options);
    if (this.retryOptions === false) return exec();
    return withRetry(exec, this.retryOptions);
  }

  private async executeOnce<T>(options: RequestOptions, isRetryAfterRefresh = false): Promise<T> {
    const scheme = options.securityScheme ?? 'bearer';
    const token = await this.tokenResolver.resolve({
      scheme,
      locationId: options.locationId,
      companyId: options.companyId,
    });

    const rateLimitKey = options.locationId ?? options.companyId ?? 'global';
    if (this.rateLimiter) await this.rateLimiter.acquire(rateLimitKey);

    const url = buildUrl(this.baseUrl, options.path, options.query);
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token.accessToken}`);
    headers.set('Version', this.apiVersion);
    headers.set('Accept', 'application/json');
    if (options.locationId) headers.set('Location-Id', options.locationId);
    if (options.companyId) headers.set('Company-Id', options.companyId);

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.json === false) {
        body = options.body as BodyInit;
      } else {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
      }
    }

    const prepared: PreparedRequest = { method: options.method, url, headers, ...(body !== undefined ? { body } : {}) };
    if (this.onRequest) await this.onRequest(prepared);

    let response: Response;
    try {
      response = await this.fetchImpl(prepared.url, {
        method: prepared.method,
        headers: prepared.headers,
        body: prepared.body,
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (cause) {
      throw new GhlNetworkError(`Network request failed: ${options.method} ${url}`, cause);
    }

    if (this.onResponse) await this.onResponse(response, prepared);

    if (response.status === 401 && !isRetryAfterRefresh) {
      await this.tokenResolver.refresh({ scheme, locationId: options.locationId, companyId: options.companyId });
      return this.executeOnce<T>(options, true);
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as GhlErrorBody | undefined;
      throw GhlError.fromResponse(response, errorBody, { method: options.method, url });
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}
