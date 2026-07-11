#!/usr/bin/env tsx
/**
 * An agency app iterating every sub-account it's installed on, via AgencyClient.
 *
 * Assumes you've already done the OAuth flow once (see oauth-marketplace-app.ts) and have a
 * companyId + agency token. We re-seed an in-memory session here for brevity — use a real
 * SessionStorage adapter in production so it survives a restart.
 *
 * Run: GHL_CLIENT_ID=... GHL_CLIENT_SECRET=... GHL_COMPANY_ID=... GHL_APP_ID=... GHL_AGENCY_ACCESS_TOKEN=... npx tsx examples/agency-multi-location.ts
 */
import { GhlClient, InMemorySessionStorage } from '../src/index.js';

async function main() {
  const clientId = process.env.GHL_CLIENT_ID;
  const clientSecret = process.env.GHL_CLIENT_SECRET;
  const companyId = process.env.GHL_COMPANY_ID;
  const appId = process.env.GHL_APP_ID;
  const agencyAccessToken = process.env.GHL_AGENCY_ACCESS_TOKEN;

  if (!clientId || !clientSecret || !companyId || !appId || !agencyAccessToken) {
    throw new Error(
      'Set GHL_CLIENT_ID, GHL_CLIENT_SECRET, GHL_COMPANY_ID, GHL_APP_ID, and GHL_AGENCY_ACCESS_TOKEN first.',
    );
  }

  const sessionStorage = new InMemorySessionStorage();
  await sessionStorage.set(companyId, {
    companyId,
    agencyToken: {
      accessToken: agencyAccessToken,
      tokenType: 'Company',
      expiresAt: Date.now() + 60 * 60 * 1000,
    },
    locationTokens: {},
  });

  const ghl = new GhlClient({ clientId, clientSecret, companyId, sessionStorage });
  const agency = ghl.asAgency({ appId });

  const installed = await agency.listInstalledLocations({ limit: 10 });
  console.log(`Found ${installed.length} installed location(s).`);

  for await (const loc of agency.locations(10)) {
    // Resources on `loc` are automatically bound to that location's access token, exchanged and
    // cached on first use — no manual token juggling per sub-account.
    const { location } = await loc.locations.get(loc.locationId);
    console.log(`- ${location.name ?? location.id} (${loc.locationId})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
