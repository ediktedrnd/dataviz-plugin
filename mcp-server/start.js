#!/usr/bin/env node
// Bootstrap wrapper: installs deps on first run, then launches the real MCP server.
// Claude Code invokes this; keeps stdout clean for JSON-RPC (logs → stderr).
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

if (!existsSync(join(here, 'node_modules'))) {
  process.stderr.write('[dataviz-mcp] first-run: installing dependencies (one-time)…\n');
  try {
    execSync('npm install --omit=dev --no-audit --no-fund --loglevel=error', {
      cwd: here,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } catch (err) {
    process.stderr.write(`[dataviz-mcp] npm install failed: ${err.message}\n`);
    process.stderr.write('[dataviz-mcp] run manually: cd ' + here + ' && npm install\n');
    process.exit(1);
  }
}

await import('./index.js');
