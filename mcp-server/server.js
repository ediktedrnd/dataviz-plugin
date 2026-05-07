/**
 * Shared MCP Server factory.
 *
 * Registers four surfaces against the SDK Server:
 *   - tools      → 13 dataviz_* function calls (tools.js)
 *   - prompts    → repo's skills/ as named prompts (skills.js)
 *   - resources  → repo's context markdown (resources.js)
 *   - instructions (initialize response) → CLAUDE.md
 *
 * Both transports (stdio in index.js, HTTP in http.js) use this factory
 * so behaviour stays identical across local and remote use.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, handleTool } from './tools.js';
import { getRequestContext, setToolName } from './context.js';
import { assertToolScope } from './oauth.js';
import { listPrompts, getPrompt } from './skills.js';
import { listResources, readResource } from './resources.js';

const here = dirname(fileURLToPath(import.meta.url));

// Remote-specific instructions live alongside the server code.
// Distinct from the repo-root CLAUDE.md, which still serves the local
// Claude Code plugin install (with credentials.json setup guidance).
function loadInstructions() {
  try {
    return readFileSync(resolve(here, 'REMOTE_INSTRUCTIONS.md'), 'utf8');
  } catch {
    return undefined;
  }
}

export function createDatavizMcpServer() {
  const instructions = loadInstructions();

  const server = new Server(
    { name: 'dataviz-mcp-server', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
      },
      instructions,
    },
  );

  // ── Tools ────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[dataviz-mcp] Tool call: ${name}`);

    // Stamp tool name into context so auth.js forwards X-Dataviz-MCP-Tool.
    setToolName(name);

    // HTTP path: enforce scopes against the OAuth token. Stdio path:
    // tokenPayload is null and assertToolScope is a no-op.
    const ctx = getRequestContext();
    try {
      assertToolScope(name, ctx?.tokenPayload || null);
    } catch (err) {
      if (err.code === 'insufficient_scope') {
        return {
          content: [
            {
              type: 'text',
              text:
                `Error: insufficient_scope. This tool requires ` +
                `[${(err.required_scopes || []).join(', ')}]; your token ` +
                `is missing [${(err.missing_scopes || []).join(', ')}].`,
            },
          ],
          isError: true,
        };
      }
      throw err;
    }

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

  // ── Prompts (skills) ─────────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, async () => listPrompts());
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return getPrompt(name, args || {});
  });

  // ── Resources (context markdown) ─────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => listResources());
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    return readResource(uri);
  });
  // We don't expose any RFC 6570 URI templates today (every resource is a
  // statically enumerated markdown file). Returning an empty list keeps the
  // capability advertised in `capabilities.resources` honest and stops MCP
  // clients from getting -32601 "method not found" when they probe.
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [],
  }));

  return server;
}
