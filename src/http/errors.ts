/** Error body shape GHL returns (BadRequestDTO / UnauthorizedDTO / UnprocessableDTO). */
export interface GhlErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface GhlErrorOptions {
  statusCode: number;
  message: string;
  body: GhlErrorBody | undefined;
  traceId?: string;
  url: string;
  method: string;
  headers?: Headers;
}

/** Base error for all failed GHL API requests. */
export class GhlError extends Error {
  readonly statusCode: number;
  readonly body: GhlErrorBody | undefined;
  readonly traceId: string | undefined;
  readonly url: string;
  readonly method: string;
  readonly headers: Headers | undefined;

  constructor(options: GhlErrorOptions) {
    super(options.message);
    this.name = 'GhlError';
    this.statusCode = options.statusCode;
    this.body = options.body;
    this.traceId = options.traceId;
    this.url = options.url;
    this.method = options.method;
    this.headers = options.headers;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static fromResponse(
    response: Response,
    body: GhlErrorBody | undefined,
    request: { method: string; url: string },
  ): GhlError {
    const message = Array.isArray(body?.message)
      ? body.message.join('; ')
      : body?.message ?? response.statusText ?? 'GoHighLevel API request failed';
    const traceId = body?.traceId ?? response.headers.get('trace-id') ?? undefined;

    const options: GhlErrorOptions = {
      statusCode: response.status,
      message,
      body,
      url: request.url,
      method: request.method,
      headers: response.headers,
      ...(traceId !== undefined ? { traceId } : {}),
    };

    if (response.status === 401 || response.status === 403) {
      return new GhlAuthError(options);
    }
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      return new GhlRateLimitError({
        ...options,
        ...(retryAfterSeconds !== undefined && !Number.isNaN(retryAfterSeconds)
          ? { retryAfterSeconds }
          : {}),
      });
    }
    if (response.status >= 500) {
      return new GhlServerError(options);
    }
    return new GhlError(options);
  }
}

/** 401/403 — invalid, expired, or insufficiently-scoped token. */
export class GhlAuthError extends GhlError {
  constructor(options: GhlErrorOptions) {
    super(options);
    this.name = 'GhlAuthError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 429 — rate limit exceeded. Carries `retryAfterSeconds` when the API provides it. */
export class GhlRateLimitError extends GhlError {
  readonly retryAfterSeconds: number | undefined;

  constructor(options: GhlErrorOptions & { retryAfterSeconds?: number }) {
    super(options);
    this.name = 'GhlRateLimitError';
    this.retryAfterSeconds = options.retryAfterSeconds;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 5xx — upstream server error, generally safe to retry. */
export class GhlServerError extends GhlError {
  constructor(options: GhlErrorOptions) {
    super(options);
    this.name = 'GhlServerError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the SDK can't tell which token to use for a request. */
export class GhlTokenResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GhlTokenResolutionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown by the network layer when a request could not be sent at all (DNS, TLS, abort, etc). */
export class GhlNetworkError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'GhlNetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
