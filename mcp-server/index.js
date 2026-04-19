#!/usr/bin/env node

/**
 * Dataviz MCP Server
 *
 * Provides Claude with structured access to the Dataviz API:
 * - Query DuckDB data
 * - Manage dashboards (list, create, save)
 * - Extract/refresh data sources
 * - Upload dynamic reports
 * - Send PDF reports via email
 *
 * Auth is handled via .env — Claude never sees credentials.
 */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, handleTool } from './tools.js';

const server = new Server(
  { name: 'dataviz-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`[dataviz-mcp] Tool call: ${name}`);

  try {
    const result = await handleTool(name, args || {});
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (err) {
    console.error(`[dataviz-mcp] Error in ${name}:`, err.message);
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[dataviz-mcp] Server running on stdio');
