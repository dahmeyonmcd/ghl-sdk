import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { GhlClient } from '../../src/client.js';
import { registerMswLifecycle, server } from './setup.js';

registerMswLifecycle();

const PIT = 'test-pit';

describe('codegen-wired resources (contacts)', () => {
  it('ghl.contacts.createContact() calls the transport with a JSON body and bearer auth', async () => {
    let capturedAuth: string | null = null;
    let capturedBody: unknown;

    server.use(
      http.post('https://services.leadconnectorhq.com/contacts/', async ({ request }) => {
        capturedAuth = request.headers.get('authorization');
        capturedBody = await request.json();
        return HttpResponse.json({ contact: { id: 'contact-1', locationId: 'loc-1' } }, { status: 201 });
      }),
    );

    const ghl = new GhlClient({ privateIntegrationToken: PIT, retry: false });
    const result = await ghl.contacts.createContact({
      locationId: 'loc-1',
      firstName: 'Ada',
      email: 'ada@example.com',
    } as any);

    expect(capturedAuth).toBe(`Bearer ${PIT}`);
    expect(capturedBody).toMatchObject({ locationId: 'loc-1', firstName: 'Ada', email: 'ada@example.com' });
    expect((result as any).contact.id).toBe('contact-1');
  });

  it('ghl.contacts.getContact() substitutes the path param', async () => {
    server.use(
      http.get('https://services.leadconnectorhq.com/contacts/:contactId', ({ params }) =>
        HttpResponse.json({ contact: { id: params.contactId } }),
      ),
    );

    const ghl = new GhlClient({ privateIntegrationToken: PIT, retry: false });
    const result = await ghl.contacts.getContact({ contactId: 'contact-42' } as any);
    expect((result as any).contact.id).toBe('contact-42');
  });
});
