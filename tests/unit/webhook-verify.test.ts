import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WebhookVerifier } from '../../src/webhooks/verify.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function sign(payload: string): string {
  const signer = createSign('SHA256');
  signer.update(payload);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

describe('WebhookVerifier', () => {
  it('verifies a correctly signed payload', () => {
    const verifier = new WebhookVerifier({ publicKey });
    const payload = JSON.stringify({ type: 'ContactCreate', locationId: 'loc-1' });
    const signature = sign(payload);

    expect(verifier.verifySignature({ payload, signature })).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const verifier = new WebhookVerifier({ publicKey });
    const signature = sign(JSON.stringify({ type: 'ContactCreate', locationId: 'loc-1' }));
    const tampered = JSON.stringify({ type: 'ContactCreate', locationId: 'loc-2' });

    expect(verifier.verifySignature({ payload: tampered, signature })).toBe(false);
  });

  it('rejects an invalid base64 signature without throwing', () => {
    const verifier = new WebhookVerifier({ publicKey });
    expect(verifier.verifySignature({ payload: 'x', signature: 'not-a-signature' })).toBe(false);
  });

  it('verify() parses and returns the typed event on success', () => {
    const verifier = new WebhookVerifier({ publicKey });
    const payload = JSON.stringify({ type: 'ContactCreate', locationId: 'loc-1', timestamp: new Date().toISOString() });
    const signature = sign(payload);

    const event = verifier.verify(payload, signature);
    expect(event.type).toBe('ContactCreate');
    expect(event.locationId).toBe('loc-1');
  });

  it('verify() throws on invalid signature', () => {
    const verifier = new WebhookVerifier({ publicKey });
    expect(() => verifier.verify('{}', 'bogus')).toThrow('Invalid webhook signature');
  });

  it('verify() throws when timestamp is outside the freshness window', () => {
    const verifier = new WebhookVerifier({ publicKey, maxAgeMs: 1000 });
    const payload = JSON.stringify({
      type: 'ContactCreate',
      locationId: 'loc-1',
      timestamp: new Date(Date.now() - 60_000).toISOString(),
    });
    const signature = sign(payload);

    expect(() => verifier.verify(payload, signature)).toThrow(/outside the acceptable/);
  });

  it('skips freshness check when maxAgeMs is false', () => {
    const verifier = new WebhookVerifier({ publicKey, maxAgeMs: false });
    const payload = JSON.stringify({
      type: 'ContactCreate',
      locationId: 'loc-1',
      timestamp: new Date(Date.now() - 60_000).toISOString(),
    });
    const signature = sign(payload);

    expect(() => verifier.verify(payload, signature)).not.toThrow();
  });
});
