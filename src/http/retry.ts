import { GhlRateLimitError, GhlServerError } from './errors.js';

export interface RetryOptions {
  /** Max retry attempts after the initial request. Default 3. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default 300. */
  baseDelayMs?: number;
  /** Max delay cap in ms. Default 10000. */
  maxDelayMs?: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

function isRetryable(error: unknown): boolean {
  if (error instanceof GhlRateLimitError || error instanceof GhlServerError) return true;
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    return typeof statusCode === 'number' && RETRYABLE_STATUS_CODES.has(statusCode);
  }
  return false;
}

function computeDelay(attempt: number, options: Required<RetryOptions>, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined) {
    return Math.min(retryAfterSeconds * 1000, options.maxDelayMs);
  }
  const exponential = options.baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * options.baseDelayMs;
  return Math.min(exponential + jitter, options.maxDelayMs);
}

/** Runs `fn` with exponential backoff retry on 429/5xx, respecting `Retry-After` when present. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const resolved: Required<RetryOptions> = {
    maxRetries: options.maxRetries ?? 3,
    baseDelayMs: options.baseDelayMs ?? 300,
    maxDelayMs: options.maxDelayMs ?? 10_000,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= resolved.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === resolved.maxRetries || !isRetryable(error)) {
        throw error;
      }
      const retryAfterSeconds = error instanceof GhlRateLimitError ? error.retryAfterSeconds : undefined;
      const delay = computeDelay(attempt, resolved, retryAfterSeconds);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
