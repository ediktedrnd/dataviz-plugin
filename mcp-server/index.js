#!/usr/bin/env node

/**
 * Dataviz MCP Server — stdio entry point.
 *
 * Used by local Claude Code installs (~/.config/dataviz/credentials.json
 * supplies the upstream Dataviz creds). Remote-MCP / ECS deployment uses
 * http.js instead.
 */

import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatavizMcpServer } from './server.js';

const server = createDatavizMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[dataviz-mcp] Server running on stdio');
