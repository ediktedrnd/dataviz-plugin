#!/usr/bin/env node

/**
 * HTTP transport entry point — used in the ECS Fargate container.
 *
 * Endpoints:
 *   GET  /health                                    — unauthenticated liveness
 *   GET  /.well-known/oauth-protected-resource      — RFC 9728 metadata
 *   POST /mcp                                       — bearer-protected MCP endpoint
 *   GET  /mcp                                       — 405 (stateless mode)
 *
 * Per-request flow on POST /mcp:
 *   1. Validate Origin header against MCP_ALLOWED_ORIGINS (when present)
 *   2. Extract + verify Authorization: Bearer
 *   3. Open an AsyncLocalStorage scope carrying { token, tokenPayload, requestId }
 *   4. Hand the request off to a fresh StreamableHTTPServerTransport bound
 *      to a one-shot Server instance. Stateless: no session reuse across requests.
 *
 * The per-request server pattern keeps things simple. A long-lived single
 * server with sessionId support is a future optimization; today's traffic
 * is light enough that one-shot is fine.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createDatavizMcpServer } from './server.js';
import { runWithRequestContext } from './context.js';
import {
  readBearer,
  verifyAccessToken,
  bearerChallengeHeader,
  protectedResourceMetadata,
} from './oauth.js';

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.disable('x-powered-by');

// ── CORS ────────────────────────────────────────────────────────────
// Browser-based MCP clients (claude.ai, the MCP Inspector) need standard
// CORS headers + a proper OPTIONS preflight. Empty MCP_ALLOWED_ORIGINS
// = allow any origin (dev-friendly); set it explicitly in production
// to e.g. "https://claude.ai,https://claude.com".
//
// `WWW-Authenticate` is in exposedHeaders so browser clients can read
// the bearer challenge after a 401.
app.use(
  cors({
    origin: ALLOWED_ORIGINS.length === 0 ? true : ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'mcp-session-id',
      'mcp-protocol-version',
      'x-request-id',
    ],
    exposedHeaders: ['WWW-Authenticate', 'mcp-session-id', 'X-Request-Id'],
    maxAge: 86400, // cache preflight for 24h
  }),
);

app.use(express.json({ limit: '10mb' }));

// ── Liveness ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'dataviz-mcp-server', version: '1.0.0' });
});

// ── OAuth protected-resource metadata (RFC 9728) ────────────────────
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  try {
    res.json(protectedResourceMetadata());
  } catch (err) {
    console.error('[dataviz-mcp] metadata error:', err.message);
    res.status(500).json({ error: 'server_misconfigured', error_description: err.message });
  }
});

// RFC 9728 §3.1: when the resource URL has a path component (we use /mcp),
// the well-known URL is constructed by inserting /.well-known/oauth-protected-resource
// BEFORE the path: /.well-known/oauth-protected-resource/mcp.
// MCP Inspector follows the spec; some clients also probe /mcp/.well-known/...
app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
  try {
    res.json(protectedResourceMetadata());
  } catch (err) {
    res.status(500).json({ error: 'server_misconfigured', error_description: err.message });
  }
});

// Backward-compat alias for clients that probe under the resource path.
app.get('/mcp/.well-known/oauth-protected-resource', (_req, res) => {
  try {
    res.json(protectedResourceMetadata());
  } catch (err) {
    res.status(500).json({ error: 'server_misconfigured', error_description: err.message });
  }
});

// ── MCP endpoint ────────────────────────────────────────────────────
// One handler for POST (client→server JSON-RPC), GET (server→client SSE
// stream), and DELETE (session terminate). The SDK transport dispatches
// internally based on req.method. Origin enforcement is handled upstream
// by the cors() middleware — disallowed browser origins never reach here.
async function handleMcpRequest(req, res) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', requestId);

  // Bearer required (applies to all methods)
  const token = readBearer(req);
  if (!token) {
    res.setHeader('WWW-Authenticate', bearerChallengeHeader());
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Authorization: Bearer <token> required',
    });
  }

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch (err) {
    console.error(`[dataviz-mcp] token rejected (${requestId}):`, err.message);
    res.setHeader('WWW-Authenticate', bearerChallengeHeader());
    return res.status(401).json({
      error: 'invalid_token',
      error_description: err.message,
    });
  }

  const context = {
    token,
    tokenPayload: payload,
    requestId,
    userId: payload.id ?? payload.sub,
    userEmail: payload.email,
    toolName: null,
  };

  // Stateless one-shot transport: a fresh server + transport per call.
  const server = createDatavizMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await runWithRequestContext(context, async () => {
      await transport.handleRequest(req, res, req.body);
    });
  } catch (err) {
    console.error(`[dataviz-mcp] transport error (${requestId}):`, err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'internal_error',
        error_description: err.message,
      });
    }
  }
}

app.post('/mcp', handleMcpRequest);
app.get('/mcp', handleMcpRequest);
app.delete('/mcp', handleMcpRequest);

// ── Boot ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.error(`[dataviz-mcp] HTTP server listening on :${PORT}`);
  console.error(`[dataviz-mcp] OAUTH_ISSUER=${process.env.OAUTH_ISSUER || '<unset>'}`);
  console.error(`[dataviz-mcp] MCP_RESOURCE=${process.env.MCP_RESOURCE || '<unset>'}`);
  if (!process.env.MCP_ACCESS_TOKEN_SECRET) {
    console.error('[dataviz-mcp] WARNING: MCP_ACCESS_TOKEN_SECRET is not set — token verification will fail');
  }
});
