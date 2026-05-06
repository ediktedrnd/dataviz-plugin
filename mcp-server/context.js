/**
 * Per-request context for the HTTP transport.
 *
 * Each /mcp request runs inside an AsyncLocalStorage scope carrying the
 * caller's bearer token + token claims, so downstream code (auth.js,
 * tool handlers) can forward the same token to Dataviz without touching
 * module globals.
 *
 * Stdio mode never enters this storage — getRequestContext() returns null,
 * and auth.js falls back to its credentials-file/env-var login flow.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithRequestContext(context, fn) {
  return storage.run(context, fn);
}

export function getRequestContext() {
  return storage.getStore() || null;
}

export function setToolName(name) {
  const ctx = storage.getStore();
  if (ctx) ctx.toolName = name;
}
