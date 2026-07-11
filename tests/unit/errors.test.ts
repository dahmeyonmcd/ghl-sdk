import { describe, expect, it } from 'vitest';
import { GhlAuthError, GhlError, GhlRateLimitError, GhlServerError } from '../../src/http/errors.js';

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe('GhlError.fromResponse', () => {
  it('maps 401 to GhlAuthError', () => {
    const error = GhlError.fromResponse(
      makeResponse(401),
      { statusCode: 401, message: 'Invalid token' },
      { method: 'GET', url: 'https://x/y' },
    );
    expect(error).toBeInstanceOf(GhlAuthError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Invalid token');
  });

  it('maps 429 to GhlRateLimitError and captures retry-after', () => {
    const error = GhlError.fromResponse(
      makeResponse(429, { 'retry-after': '5' }),
      { statusCode: 429, message: 'Too many requests' },
      { method: 'GET', url: 'https://x/y' },
    );
    expect(error).toBeInstanceOf(GhlRateLimitError);
    expect((error as GhlRateLimitError).retryAfterSeconds).toBe(5);
  });

  it('maps 5xx to GhlServerError', () => {
    const error = GhlError.fromResponse(makeResponse(503), undefined, { method: 'GET', url: 'https://x/y' });
    expect(error).toBeInstanceOf(GhlServerError);
  });

  it('joins array message bodies', () => {
    const error = GhlError.fromResponse(
      makeResponse(422),
      { statusCode: 422, message: ['field a is required', 'field b is required'] },
      { method: 'POST', url: 'https://x/y' },
    );
    expect(error.message).toBe('field a is required; field b is required');
  });

  it('falls back to statusText when no body message is present', () => {
    const response = new Response(null, { status: 400, statusText: 'Bad Request' });
    const error = GhlError.fromResponse(response, undefined, { method: 'GET', url: 'https://x/y' });
    expect(error.message).toBe('Bad Request');
  });
});
