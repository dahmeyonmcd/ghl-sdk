import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { GhlClient } from '../../src/client.js';
import { registerMswLifecycle, server } from './setup.js';

registerMswLifecycle();

const PIT = 'test-private-integration-token';

function makeClient() {
  return new GhlClient({ privateIntegrationToken: PIT, retry: false });
}

describe('LocationsResource (PIT auth)', () => {
  it('get() sends the bearer token and Version header, returns the parsed location', async () => {
    let capturedAuth: string | null = null;
    let capturedVersion: string | null = null;

    server.use(
      http.get('https://services.leadconnectorhq.com/locations/:locationId', ({ request, params }) => {
        capturedAuth = request.headers.get('authorization');
        capturedVersion = request.headers.get('version');
        return HttpResponse.json({ location: { id: params.locationId, name: 'Test Location' } });
      }),
    );

    const ghl = makeClient();
    const result = await ghl.locations.get('loc-123');

    expect(capturedAuth).toBe(`Bearer ${PIT}`);
    expect(capturedVersion).toBe('2021-07-28');
    expect(result.location.id).toBe('loc-123');
    expect(result.location.name).toBe('Test Location');
  });

  it('search() forwards query params', async () => {
    let capturedUrl: URL | undefined;

    server.use(
      http.get('https://services.leadconnectorhq.com/locations/search', ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ locations: [] });
      }),
    );

    const ghl = makeClient();
    await ghl.locations.search({ companyId: 'company-1', skip: 10, limit: 20, order: 'desc' });

    expect(capturedUrl?.searchParams.get('companyId')).toBe('company-1');
    expect(capturedUrl?.searchParams.get('skip')).toBe('10');
    expect(capturedUrl?.searchParams.get('limit')).toBe('20');
    expect(capturedUrl?.searchParams.get('order')).toBe('desc');
  });

  it('throws a GhlError with parsed body on a 4xx response', async () => {
    server.use(
      http.get('https://services.leadconnectorhq.com/locations/:locationId', () =>
        HttpResponse.json({ statusCode: 404, message: 'Location not found' }, { status: 404 }),
      ),
    );

    const ghl = makeClient();
    await expect(ghl.locations.get('missing')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Location not found',
    });
  });

  it('delete() sends deleteTwilioAccount as a query param', async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.delete('https://services.leadconnectorhq.com/locations/:locationId', ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ success: true });
      }),
    );

    const ghl = makeClient();
    const result = await ghl.locations.delete('loc-1', { deleteTwilioAccount: true });

    expect(result.success).toBe(true);
    expect(capturedUrl?.searchParams.get('deleteTwilioAccount')).toBe('true');
  });
});
