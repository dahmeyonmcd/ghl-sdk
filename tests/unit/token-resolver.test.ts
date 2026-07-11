import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemorySessionStorage } from '../../src/auth/session-storage.js';
import { OAuthTokenResolver, StaticTokenResolver } from '../../src/auth/token-resolver.js';
import { GhlTokenResolutionError } from '../../src/http/errors.js';
import type { SessionData } from '../../src/auth/types.js';

describe('StaticTokenResolver', () => {
  it('always resolves the configured token regardless of scheme', async () => {
    const resolver = new StaticTokenResolver('pit-token-123');
    const result = await resolver.resolve({ scheme: 'Agency-Access-Only' });
    expect(result.accessToken).toBe('pit-token-123');
  });

  it('throws on refresh (PITs cannot be refreshed)', async () => {
    const resolver = new StaticTokenResolver('pit-token-123');
    await expect(resolver.refresh({ scheme: 'bearer' })).rejects.toThrow(GhlTokenResolutionError);
  });
});

describe('OAuthTokenResolver', () => {
  const companyId = 'company-1';
  let sessionStorage: InMemorySessionStorage;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage = new InMemorySessionStorage();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeResolver() {
    return new OAuthTokenResolver({
      config: { clientId: 'client-id', clientSecret: 'client-secret' },
      sessionStorage,
      companyId,
    });
  }

  it('throws when no session exists for the companyId', async () => {
    const resolver = makeResolver();
    await expect(resolver.resolve({ scheme: 'Agency-Access' })).rejects.toThrow(GhlTokenResolutionError);
  });

  it('returns a cached non-expired agency token without hitting the network', async () => {
    const session: SessionData = {
      companyId,
      agencyToken: {
        accessToken: 'agency-token',
        tokenType: 'Company',
        expiresAt: Date.now() + 60_000,
      },
      locationTokens: {},
    };
    await sessionStorage.set(companyId, session);

    const resolver = makeResolver();
    const result = await resolver.resolve({ scheme: 'Agency-Access' });
    expect(result.accessToken).toBe('agency-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes an expired agency token via /oauth/token', async () => {
    const session: SessionData = {
      companyId,
      agencyToken: {
        accessToken: 'stale-agency-token',
        refreshToken: 'refresh-token-1',
        tokenType: 'Company',
        expiresAt: Date.now() - 1000,
      },
      locationTokens: {},
    };
    await sessionStorage.set(companyId, session);

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'fresh-agency-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'refresh-token-2',
          userId: 'user-1',
          companyId,
        }),
        { status: 200 },
      ),
    );

    const resolver = makeResolver();
    const result = await resolver.resolve({ scheme: 'Agency-Access' });

    expect(result.accessToken).toBe('fresh-agency-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/oauth/token');
    expect(init.body.toString()).toContain('grant_type=refresh_token');

    const persisted = await sessionStorage.get(companyId);
    expect(persisted?.agencyToken?.accessToken).toBe('fresh-agency-token');
    expect(persisted?.agencyToken?.refreshToken).toBe('refresh-token-2');
  });

  it('derives and caches a location token via /oauth/locationToken when not cached', async () => {
    const session: SessionData = {
      companyId,
      agencyToken: {
        accessToken: 'agency-token',
        tokenType: 'Company',
        expiresAt: Date.now() + 60_000,
      },
      locationTokens: {},
    };
    await sessionStorage.set(companyId, session);

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'location-token-1',
          token_type: 'Bearer',
          expires_in: 3600,
          userId: 'user-1',
          locationId: 'loc-1',
        }),
        { status: 200 },
      ),
    );

    const resolver = makeResolver();
    const result = await resolver.resolve({ scheme: 'Location-Access-Only', locationId: 'loc-1' });

    expect(result.accessToken).toBe('location-token-1');
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/oauth/locationToken');

    const persisted = await sessionStorage.get(companyId);
    expect(persisted?.locationTokens['loc-1']?.accessToken).toBe('location-token-1');

    // Second resolve for the same location should hit the cache, not the network again.
    fetchMock.mockClear();
    const cached = await resolver.resolve({ scheme: 'Location-Access-Only', locationId: 'loc-1' });
    expect(cached.accessToken).toBe('location-token-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when a location-scoped request has no locationId', async () => {
    await sessionStorage.set(companyId, {
      companyId,
      agencyToken: { accessToken: 'agency-token', tokenType: 'Company', expiresAt: Date.now() + 60_000 },
      locationTokens: {},
    });
    const resolver = makeResolver();
    await expect(resolver.resolve({ scheme: 'Location-Access-Only' })).rejects.toThrow(GhlTokenResolutionError);
  });
});
