import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../../src/http/retry.js';
import { GhlRateLimitError, GhlServerError, GhlError } from '../../src/http/errors.js';

function makeRateLimitError(retryAfterSeconds?: number): GhlRateLimitError {
  return new GhlRateLimitError({
    statusCode: 429,
    message: 'rate limited',
    body: undefined,
    url: 'https://services.leadconnectorhq.com/x',
    method: 'GET',
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });
}

describe('withRetry', () => {
  it('returns the result immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on GhlRateLimitError up to maxRetries then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeRateLimitError(0))
      .mockRejectedValueOnce(makeRateLimitError(0))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on GhlServerError (5xx)', async () => {
    const serverError = new GhlServerError({
      statusCode: 503,
      message: 'unavailable',
      body: undefined,
      url: 'https://x',
      method: 'GET',
    });
    const fn = vi.fn().mockRejectedValueOnce(serverError).mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 1, baseDelayMs: 1 });
    expect(result).toBe('ok');
  });

  it('does not retry non-retryable errors', async () => {
    const notFound = new GhlError({
      statusCode: 404,
      message: 'not found',
      body: undefined,
      url: 'https://x',
      method: 'GET',
    });
    const fn = vi.fn().mockRejectedValue(notFound);
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toBe(notFound);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting maxRetries', async () => {
    const fn = vi.fn().mockRejectedValue(makeRateLimitError(0));
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
