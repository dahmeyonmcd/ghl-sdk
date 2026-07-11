#!/usr/bin/env tsx
/**
 * Simplest usage: a Private Integration Token scoped to a single location (or agency), no OAuth
 * flow required. Typical for internal tools automating one GHL account.
 *
 * Run: GHL_PIT=... GHL_LOCATION_ID=... npx tsx examples/pit-single-location.ts
 */
import { GhlClient } from '../src/index.js';

async function main() {
  const pit = process.env.GHL_PIT;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!pit || !locationId) {
    throw new Error('Set GHL_PIT and GHL_LOCATION_ID environment variables first.');
  }

  const ghl = new GhlClient({ privateIntegrationToken: pit });

  const { location } = await ghl.locations.get(locationId);
  console.log(`Location: ${location.name} (${location.id})`);

  const contact = await ghl.contacts.createContact({
    locationId,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: `ada+${Date.now()}@example.com`,
  } as any);
  console.log('Created contact:', contact);

  const contacts = await ghl.contacts.getContacts({ locationId, limit: 5 } as any);
  console.log('First 5 contacts:', contacts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
