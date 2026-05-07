/**
 * OAuth 2.1 protected-resource helpers.
 *
 * The Dataviz backend (see /Users/.../Dataviz/backend/src/oauth) is the
 * authorization server. We are the resource server: we validate the
 * HS256-signed access tokens it issues, enforce per-tool scopes, and
 * advertise our metadata at /.well-known/oauth-protected-resource.
 *
 * Token format (set by Dataviz tokens.js):
 *   alg: HS256
 *   iss: process.env.OAUTH_ISSUER       (e.g. https://dataviz.edikted.tech)
 *   aud: process.env.MCP_RESOURCE        (e.g. https://dataviz-mcp.api.../mcp)
 *   secret: process.env.MCP_ACCESS_TOKEN_SECRET (shared symmetric key)
 *   payload: { id, email, role, name, site_id, scope, client_id,
 *              auth_source: 'mcp', token_use: 'access' }
 */
import { jwtVerify } from 'jose';

const SUPPORTED_SCOPES = [
  'dataviz:read',
  'dataviz:query',
  'dataviz:dashboard:write',
  'dataviz:source:write',
  'dataviz:report:write',
  'dataviz:report:send',
];

// Tool → required scope(s). Mirrors the dev's plan and the route gating in
// the Dataviz backend; the AS will normally issue tokens with at least the
// scope the tool needs. We re-check here so a narrower token can't be
// upgraded by lying about which tool is being called.
const TOOL_SCOPES = {
  dataviz_query:            ['dataviz:query'],
  dataviz_list_tables:      ['dataviz:read'],
  dataviz_describe_table:   ['dataviz:read'],
  dataviz_list_dashboards:  ['dataviz:read'],
  dataviz_get_dashboard:    ['dataviz:read'],
  dataviz_create_dashboard: ['dataviz:dashboard:write'],
  dataviz_save_dashboard:   ['dataviz:dashboard:write'],
  dataviz_extract_source:   ['dataviz:source:write'],
  dataviz_extract_status:   ['dataviz:read'],
  dataviz_list_sources:     ['dataviz:read'],
  dataviz_upload_csv:       ['dataviz:source:write'],
  dataviz_upload_report:    ['dataviz:report:write'],
  dataviz_send_report:      ['dataviz:report:send'],
};

const encoder = new TextEncoder();

function getSecret() {
  const secret = process.env.MCP_ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('MCP_ACCESS_TOKEN_SECRET is not set');
  return encoder.encode(secret);
}

function getIssuer() {
  const issuer = process.env.OAUTH_ISSUER;
  if (!issuer) throw new Error('OAUTH_ISSUER is not set');
  return issuer.replace(/\/$/, '');
}

function getResource() {
  const resource = process.env.MCP_RESOURCE;
  if (!resource) throw new Error('MCP_RESOURCE is not set');
  return resource;
}

function getPublicUrl() {
  return process.env.MCP_PUBLIC_URL || getResource().replace(/\/mcp\/?$/, '');
}

/**
 * Verify an access token and return the parsed payload.
 * Throws on invalid signature, wrong issuer, wrong audience, or expiry.
 */
export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: getIssuer(),
    audience: getResource(),
  });
  return payload;
}

/**
 * Pull the bearer token off an Express-style request.
 * Returns null if the Authorization header is missing or malformed.
 */
export function readBearer(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * RFC 6750 / 9728 challenge response. Tells the client where to discover
 * which authorization server to use.
 */
export function bearerChallengeHeader() {
  const metadataUrl = `${getPublicUrl().replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadataUrl}"`;
}

/**
 * RFC 9728-style protected-resource metadata.
 */
export function protectedResourceMetadata() {
  return {
    resource: getResource(),
    authorization_servers: [getIssuer()],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ['header'],
  };
}

/**
 * Parse the space-separated scope claim into a Set.
 */
function tokenScopeSet(payload) {
  return new Set(String(payload?.scope || '').split(/\s+/).filter(Boolean));
}

/**
 * Throws { status: 403, code: 'insufficient_scope', missing }
 * if the token cannot call this tool.
 *
 * Stdio mode: payload is null (no token), and we don't enforce.
 */
export function assertToolScope(toolName, payload) {
  if (!payload) return; // stdio path
  const required = TOOL_SCOPES[toolName] || [];
  if (required.length === 0) return;
  const scopes = tokenScopeSet(payload);
  const missing = required.filter((s) => !scopes.has(s));
  if (missing.length > 0) {
    const err = new Error(`insufficient_scope: missing ${missing.join(', ')}`);
    err.code = 'insufficient_scope';
    err.required_scopes = required;
    err.missing_scopes = missing;
    err.status = 403;
    throw err;
  }
}

export { SUPPORTED_SCOPES, TOOL_SCOPES };
