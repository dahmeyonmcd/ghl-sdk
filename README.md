# @dahmeyonmcd/ghl-sdk

Enterprise-grade Node.js / TypeScript SDK for the [GoHighLevel API v2](https://highlevel.stoplight.io/), generated from
the official [GoHighLevel/highlevel-api-docs](https://github.com/GoHighLevel/highlevel-api-docs) OpenAPI specs. Covers
all 41 v2 API modules with agency OAuth, multi-location token management, webhooks, and built-in HTTP resilience
(rate limiting, retries, structured errors).

## Install

```bash
npm install @dahmeyonmcd/ghl-sdk
```

Requires Node.js >= 18 (uses native `fetch`).

## Quick start

### Private Integration Token (internal tools)

```ts
import { GhlClient } from '@dahmeyonmcd/ghl-sdk';

const ghl = new GhlClient({ privateIntegrationToken: process.env.GHL_PIT! });

const { location } = await ghl.locations.get(locationId);
const contact = await ghl.contacts.createContact({ locationId, firstName: 'Ada', email: 'ada@example.com' });
```

### OAuth marketplace app

```ts
import { GhlClient, InMemorySessionStorage } from '@dahmeyonmcd/ghl-sdk';

const sessionStorage = new InMemorySessionStorage(); // swap for Redis/Postgres/etc in production
const ghl = new GhlClient({
  clientId: process.env.GHL_CLIENT_ID!,
  clientSecret: process.env.GHL_CLIENT_SECRET!,
  redirectUri: process.env.GHL_REDIRECT_URI!,
  sessionStorage,
});

// 1. Redirect the user to authorize:
const authUrl = ghl.auth.getAuthorizationUrl({ scope: 'contacts.readonly contacts.write locations.readonly' });

// 2. In your OAuth callback handler:
const token = await ghl.auth.exchangeCode(req.query.code);
// token.companyId is now known; session is persisted to sessionStorage automatically.
```

See [`examples/`](examples/) for complete runnable scripts.

## Auth matrix

GHL has three token types; the SDK auto-selects the right one per request based on the endpoint's declared
[security scheme](https://github.com/GoHighLevel/highlevel-api-docs/blob/main/docs/oauth/Scopes.md):

| Token | Scope | How to get it |
|---|---|---|
| **Private Integration Token (PIT)** | Pre-scoped to one agency or one location at creation time in the GHL dashboard | Settings → Private Integrations |
| **Agency (Company) access token** | Agency-level ops: `locations.write`, `oauth.write`, `snapshots.readonly`, SaaS bulk ops | OAuth `authorization_code` grant with `user_type=Company` |
| **Location access token** | Most CRM endpoints (contacts, opportunities, calendars, ...) | Derived from an agency token via `POST /oauth/locationToken`, or its own OAuth grant |

With a PIT client, every request just uses that token — you're responsible for creating a PIT with the right scope
for what you intend to call. With an OAuth client, the SDK reads each endpoint's security scheme
(`Agency-Access[-Only]` vs `Location-Access[-Only]` vs `bearer`) and resolves/caches/refreshes the correct token
automatically, exchanging location tokens from the agency token on first use.

## Enterprise: multi-location agency apps

```ts
const agency = ghl.asAgency({ appId: process.env.GHL_APP_ID! });

for await (const loc of agency.locations()) {
  // `loc`'s resources are automatically bound to that location's access token.
  const { location } = await loc.locations.get(loc.locationId);
  console.log(location.name);
}
```

`AgencyClient` wraps `oauth.getInstalledLocations` pagination and per-location token exchange/caching so you never
manage tokens by hand across sub-accounts. See [`examples/agency-multi-location.ts`](examples/agency-multi-location.ts).

## Rate limiting & retries

Every request goes through a token-bucket rate limiter (default 100 req / 10s, keyed by `locationId`/`companyId` per
GHL's documented limits) and exponential-backoff retry on `429`/`5xx` (respecting `Retry-After`). Configure or disable
per client:

```ts
new GhlClient({
  privateIntegrationToken: pit,
  rateLimiter: { maxRequests: 100, windowMs: 10_000 }, // or `false` to disable
  retry: { maxRetries: 3, baseDelayMs: 300 },           // or `false` to disable
});
```

## Error handling

All failed requests throw a `GhlError` subclass with `statusCode`, `message`, `body` (parsed response), and `traceId`:

```ts
import { GhlError, GhlAuthError, GhlRateLimitError } from '@dahmeyonmcd/ghl-sdk';

try {
  await ghl.contacts.getContact({ contactId });
} catch (error) {
  if (error instanceof GhlAuthError) {
    // 401/403 — invalid/expired token or missing scope
  } else if (error instanceof GhlRateLimitError) {
    // 429 — error.retryAfterSeconds, though the SDK already retries these automatically
  } else if (error instanceof GhlError) {
    console.error(error.statusCode, error.message, error.body);
  }
}
```

## Webhooks

```ts
import { WebhookVerifier } from '@dahmeyonmcd/ghl-sdk';

const verifier = new WebhookVerifier(); // uses GHL's published public key by default
const event = verifier.verify(rawRequestBody, req.headers['x-wh-signature']);
console.log(event.type); // 'ContactCreate' | 'OpportunityUpdate' | ... (53 event types)
```

Optional Express middleware (peer dependency — `npm install express`):

```ts
import express from 'express';
import { ghlWebhookMiddleware } from '@dahmeyonmcd/ghl-sdk/webhooks/express';

app.post('/webhooks/ghl', express.raw({ type: 'application/json' }), ghlWebhookMiddleware(), (req, res) => {
  console.log(req.ghlWebhookEvent);
  res.sendStatus(200);
});
```

## Pagination

```ts
import { paginateOffset } from '@dahmeyonmcd/ghl-sdk';

const contacts = paginateOffset({
  fetchPage: ({ skip, limit }) => ghl.contacts.getContacts({ locationId, skip, limit }).then((r) => r.contacts ?? []),
});
for await (const contact of contacts) {
  console.log(contact.id);
}
```

## Resource coverage

All 41 v2 API modules are exposed as typed properties on `GhlClient` (e.g. `ghl.contacts`, `ghl.opportunities`,
`ghl.calendars`, `ghl.payments`, `ghl.snapshots`, ...). `oauth` and `locations` are hand-written to anchor the
enterprise auth architecture; the remaining 39 are generated from the OpenAPI specs — see
[Development](#development) to regenerate after a spec update.

## Development

```bash
npm install
npm run sync:specs      # git submodule update --remote specs/highlevel-api-docs
npm run generate        # regenerate all 39 codegen'd resource modules
npm run validate:coverage
npm run typecheck
npm run test
npm run build
```

### Architecture

```
src/
├── client.ts            # GhlClient — root entrypoint, wires auth + transport + resources
├── auth/                 # TokenResolver, OAuthFlow, SessionStorage, AuthManager
├── http/                 # HttpTransport, rate limiter, retry, structured errors, pagination
├── enterprise/            # AgencyClient (multi-location facade), scope registry
├── webhooks/              # signature verification, typed events, optional Express middleware
└── resources/
    ├── oauth/, locations/ # hand-written — validate the auth architecture
    └── {module}/           # 39 codegen'd modules, one per OpenAPI spec in specs/highlevel-api-docs/apps
```

Every resource method — hand-written or generated — calls the same `HttpTransport`, so auth resolution, rate
limiting, retries, and error parsing are consistent across the whole surface.

## License

MIT
