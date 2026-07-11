import { createVerify } from 'node:crypto';
import type { GhlWebhookEvent, WebhookEventType } from './types.js';

/** GHL's published webhook signing key (RSA-SHA256), same for every app. Override via `publicKey` if GHL ever rotates it. */
export const GHL_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

export interface WebhookVerifierOptions {
  /** Overrides the built-in GHL public key, e.g. after a documented key rotation. */
  publicKey?: string;
  /**
   * Max age (ms) a webhook's `timestamp` may be before it's rejected as a possible replay.
   * Defaults to 5 minutes per GHL's guidance. Set to `false` to disable the check.
   */
  maxAgeMs?: number | false;
}

export interface VerifyOptions {
  /** Raw request body exactly as received — verify before any JSON parsing/re-serialization. */
  payload: string | Buffer;
  /** Value of the `x-wh-signature` request header. */
  signature: string;
}

/**
 * Verifies the `x-wh-signature` header and optionally checks timestamp freshness. Doesn't
 * dedupe `webhookId` — that needs storage of your own if you care about replay beyond the window.
 */
export class WebhookVerifier {
  private readonly publicKey: string;
  private readonly maxAgeMs: number | false;

  constructor(options: WebhookVerifierOptions = {}) {
    this.publicKey = options.publicKey ?? GHL_WEBHOOK_PUBLIC_KEY;
    this.maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1000;
  }

  /** Returns true iff the signature is valid for the given raw payload. Does not check freshness. */
  verifySignature(options: VerifyOptions): boolean {
    const verifier = createVerify('SHA256');
    verifier.update(options.payload);
    verifier.end();
    try {
      return verifier.verify(this.publicKey, options.signature, 'base64');
    } catch {
      return false;
    }
  }

  private checkFreshness(payload: GhlWebhookEvent): void {
    if (this.maxAgeMs === false) return;
    if (!payload.timestamp) return;
    const eventTime = Date.parse(payload.timestamp);
    if (Number.isNaN(eventTime)) return;
    const age = Date.now() - eventTime;
    if (age > this.maxAgeMs || age < -this.maxAgeMs) {
      throw new Error(
        `Webhook timestamp "${payload.timestamp}" is outside the acceptable ${this.maxAgeMs}ms window (age=${age}ms) — possible replay.`,
      );
    }
  }

  /** Verifies signature + freshness and returns the parsed event. Throws on a bad signature or a stale timestamp. */
  verify<TType extends WebhookEventType = WebhookEventType>(
    rawBody: string | Buffer,
    signature: string,
  ): GhlWebhookEvent<TType> {
    if (!this.verifySignature({ payload: rawBody, signature })) {
      throw new Error('Invalid webhook signature.');
    }
    const payload = JSON.parse(rawBody.toString('utf-8')) as GhlWebhookEvent<TType>;
    this.checkFreshness(payload);
    return payload;
  }
}
