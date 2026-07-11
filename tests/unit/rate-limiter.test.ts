import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/http/rate-limiter.js';

describe('RateLimiter', () => {
  it('allows requests up to the max within a window without delay', async () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 10_000 });
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      await limiter.acquire('loc-1');
    }
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('delays once the bucket is exhausted', async () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 200 });
    await limiter.acquire('loc-1');
    await limiter.acquire('loc-1');

    const start = Date.now();
    await limiter.acquire('loc-1');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });

  it('tracks separate buckets per key', async () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 200 });
    await limiter.acquire('loc-1');

    const start = Date.now();
    await limiter.acquire('loc-2');
    expect(Date.now() - start).toBeLessThan(50);
  });
});
