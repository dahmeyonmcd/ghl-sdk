#!/usr/bin/env tsx
/**
 * Marketplace OAuth app flow: print an authorization URL, then run a tiny HTTP server to catch
 * the redirect, exchange the code for tokens, and persist the session.
 *
 * Run: GHL_CLIENT_ID=... GHL_CLIENT_SECRET=... GHL_REDIRECT_URI=http://localhost:3000/oauth/callback npx tsx examples/oauth-marketplace-app.ts
 * Then visit the printed URL, approve the app, and watch the console.
 */
import { createServer } from 'node:http';
import { GhlClient, InMemorySessionStorage } from '../src/index.js';

async function main() {
  const clientId = process.env.GHL_CLIENT_ID;
  const clientSecret = process.env.GHL_CLIENT_SECRET;
  const redirectUri = process.env.GHL_REDIRECT_URI ?? 'http://localhost:3000/oauth/callback';
  if (!clientId || !clientSecret) {
    throw new Error('Set GHL_CLIENT_ID and GHL_CLIENT_SECRET environment variables first.');
  }

  const sessionStorage = new InMemorySessionStorage();

  // No companyId yet — it's only known once the OAuth callback resolves it.
  const ghl = new GhlClient({ clientId, clientSecret, redirectUri, sessionStorage });

  const authUrl = ghl.auth.getAuthorizationUrl({
    scope: 'locations.readonly contacts.readonly contacts.write oauth.readonly',
  });
  console.log('\nOpen this URL to install the app:\n');
  console.log(authUrl, '\n');

  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith('/oauth/callback')) {
      res.writeHead(404).end();
      return;
    }

    const url = new URL(req.url, redirectUri);
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400).end('Missing ?code');
      return;
    }

    const token = await ghl.auth.exchangeCode(code, redirectUri);
    console.log('\nOAuth install complete.');
    console.log(`  companyId: ${token.companyId}`);
    console.log(`  userType:  ${token.userType}`);
    console.log(`  scope:     ${token.scope}`);

    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('App installed — you can close this tab.');
    server.close();
  });

  server.listen(3000, () => console.log('Waiting for the OAuth redirect on http://localhost:3000/oauth/callback ...'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
