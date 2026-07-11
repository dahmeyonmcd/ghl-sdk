export interface RateLimiterOptions {
  /** Max requests allowed per window. GHL default is 100 requests / 10s per resource (location or company). */
  maxRequests?: number;
  /** Window duration in milliseconds. */
  windowMs?: number;
}

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

/** Token-bucket limiter keyed by locationId/companyId, since GHL rate-limits per resource, not globally. */
export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimiterOptions = {}) {
    this.maxRequests = options.maxRequests ?? 100;
    this.windowMs = options.windowMs ?? 10_000;
  }

  private getBucket(key: string): Bucket {
    const existing = this.buckets.get(key);
    if (existing) return existing;
    const bucket: Bucket = { tokens: this.maxRequests, lastRefillAt: Date.now() };
    this.buckets.set(key, bucket);
    return bucket;
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefillAt;
    if (elapsed <= 0) return;
    const refillRate = this.maxRequests / this.windowMs;
    bucket.tokens = Math.min(this.maxRequests, bucket.tokens + elapsed * refillRate);
    bucket.lastRefillAt = now;
  }

  /** Resolves once a slot is available for `key`, consuming one token. */
  async acquire(key: string): Promise<void> {
    for (;;) {
      const bucket = this.getBucket(key);
      this.refill(bucket);

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return;
      }

      const tokensNeeded = 1 - bucket.tokens;
      const waitMs = Math.ceil(tokensNeeded / (this.maxRequests / this.windowMs));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
