import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { GhlClient } from '../../src/client.js';
import { InMemorySessionStorage } from '../../src/auth/session-storage.js';
import { registerMswLifecycle, server } from './setup.js';

registerMswLifecycle();

describe('OAuth flow (marketplace app)', () => {
  it('builds a valid authorization URL', () => {
    const ghl = new GhlClient({
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      redirectUri: 'https://myapp.com/oauth/callback',
      companyId: 'company-1',
    });

    const url = ghl.auth.getAuthorizationUrl({ scope: 'locations.readonly contacts.readonly' });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://marketplace.gohighlevel.com/v2/oauth/chooselocation');
    expect(parsed.searchParams.get('client_id')).toBe('client-abc');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://myapp.com/oauth/callback');
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });

  it('exchangeCode() persists the resulting agency token to sessionStorage', async () => {
    server.use(
      http.post('https://services.leadconnectorhq.com/oauth/token', async ({ request }) => {
        const body = await request.text();
        expect(body).toContain('grant_type=authorization_code');
        expect(body).toContain('code=auth-code-1');
        return HttpResponse.json({
          access_token: 'agency-access-token',
          token_type: 'Bearer',
          expires_in: 86_399,
          refresh_token: 'agency-refresh-token',
          userType: 'Company',
          companyId: 'company-1',
          userId: 'user-1',
          scope: 'locations.readonly',
        });
      }),
    );

    const sessionStorage = new InMemorySessionStorage();
    const ghl = new GhlClient({
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      redirectUri: 'https://myapp.com/oauth/callback',
      companyId: 'company-1',
      sessionStorage,
    });

    const token = await ghl.auth.exchangeCode('auth-code-1');
    expect(token.access_token).toBe('agency-access-token');

    const session = await sessionStorage.get('company-1');
    expect(session?.agencyToken?.accessToken).toBe('agency-access-token');
    expect(session?.agencyToken?.refreshToken).toBe('agency-refresh-token');
  });

  it('getLocationToken() exchanges and caches a location token from the agency session', async () => {
    server.use(
      http.post('https://services.leadconnectorhq.com/oauth/locationToken', async ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer agency-access-token');
        return HttpResponse.json({
          access_token: 'location-access-token',
          token_type: 'Bearer',
          expires_in: 86_399,
          locationId: 'loc-1',
          userId: 'user-1',
        });
      }),
    );

    const sessionStorage = new InMemorySessionStorage();
    await sessionStorage.set('company-1', {
      companyId: 'company-1',
      agencyToken: {
        accessToken: 'agency-access-token',
        tokenType: 'Company',
        expiresAt: Date.now() + 60_000,
      },
      locationTokens: {},
    });

    const ghl = new GhlClient({
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      companyId: 'company-1',
      sessionStorage,
    });

    const token = await ghl.auth.getLocationToken('loc-1');
    expect(token).toBe('location-access-token');
  });
});
