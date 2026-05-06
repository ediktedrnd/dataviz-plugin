#!/usr/bin/env node
// Mint a self-signed MCP access token for local testing.
//
// Usage:
//   node scripts/mint-test-token.mjs
//   node scripts/mint-test-token.mjs --scope "dataviz:read dataviz:query"
//   node scripts/mint-test-token.mjs --user-id 42 --email user@edikted.com
//
// Reads MCP_ACCESS_TOKEN_SECRET, OAUTH_ISSUER, MCP_RESOURCE from .env or env.
// Mirrors the claim shape Dataviz/backend/src/oauth/tokens.js produces.
import 'dotenv/config';
import { SignJWT } from 'jose';

function readArg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const secret = process.env.MCP_ACCESS_TOKEN_SECRET;
const issuer = process.env.OAUTH_ISSUER;
const audience = readArg('audience', process.env.MCP_RESOURCE);

if (!secret) throw new Error('MCP_ACCESS_TOKEN_SECRET is not set');
if (!issuer) throw new Error('OAUTH_ISSUER is not set');
if (!audience) throw new Error('MCP_RESOURCE (or --audience) is not set');

const userId = Number(readArg('user-id', '1'));
const email = readArg('email', 'local-test@edikted.com');
const role = readArg('role', 'admin');
const name = readArg('name', 'Local Test User');
const scope = readArg(
  'scope',
  'dataviz:read dataviz:query dataviz:dashboard:write dataviz:source:write dataviz:report:write dataviz:report:send',
);
const ttl = readArg('ttl', '3600s');

const token = await new SignJWT({
  id: userId,
  email,
  role,
  name,
  site_id: null,
  scope,
  client_id: 'dvz_mcp_local_test',
  auth_source: 'mcp',
  token_use: 'access',
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer(issuer.replace(/\/$/, ''))
  .setAudience(audience)
  .setSubject(String(userId))
  .setIssuedAt()
  .setExpirationTime(ttl)
  .sign(new TextEncoder().encode(secret));

console.log(token);
