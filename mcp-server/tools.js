/**
 * Tool definitions and handlers for the Dataviz MCP server.
 * Each tool wraps a Dataviz API call and returns structured results.
 */
import { apiJson, apiFetch, getBaseUrl, getToken, setEnvironment, currentEnvironmentUrl, KNOWN_ENVIRONMENTS } from './auth.js';
import { getRequestContext } from './context.js';
import { readResource } from './resources.js';

// Cache last-fetched report source per slug so dataviz_upload_report can send
// the base_hash (content fingerprint) the edit was based on — lets the server
// 3-way-merge concurrent edits instead of silently overwriting another editor.
const reportSourceCache = new Map();

// ── Tool Definitions (JSON Schema) ─────────────────────────────

export const TOOLS = [
  {
    name: 'dataviz_read_context',
    description: 'Read a dataviz:// context resource (KPI definitions, table catalog, skill instructions, BA docs) by URI and return its markdown text. Use this when your MCP client does not expose the resources/read primitive directly — every analyst client supports plain tool calls, so this is the universal way to satisfy the context-read precondition on dataviz_query. Available URIs include dataviz://context/kpis.md, dataviz://context/data-sources.md, dataviz://context/conventions.md, dataviz://context/rules.md, dataviz://skill/query-data/SKILL.md, dataviz://skill/edikted-ba/SKILL.md (plus per-skill drill-downs under dataviz://skill/<name>/context/).',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'dataviz:// URI of the resource to read (e.g. "dataviz://context/kpis.md")' },
      },
      required: ['uri'],
    },
  },
  {
    name: 'dataviz_query',
    description: 'Execute a SQL query against DuckDB (read-only analytics database). Use this to explore data, check table contents, or run ad-hoc analytics. Example: SELECT date, SUM(total_revenue) FROM query_5_Daily_Orders_Aggregated GROUP BY date ORDER BY date DESC LIMIT 10. Before calling this tool you MUST first read the relevant business context — call dataviz_read_context({uri}) for each one (works in every MCP client), or use MCP resources/read if your client exposes it — and pass the URIs you read in acknowledged_context_read. Table names, status filters and KPI formulas in this warehouse are non-obvious and queries without context routinely return wrong numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query to execute against DuckDB' },
        acknowledged_context_read: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            enum: [
              'dataviz://context/kpis.md',
              'dataviz://context/data-sources.md',
              'dataviz://context/conventions.md',
              'dataviz://context/rules.md',
              'dataviz://skill/query-data/SKILL.md',
              'dataviz://skill/edikted-ba/SKILL.md',
            ],
          },
          description: 'REQUIRED. List every dataviz:// resource URI you actually loaded in THIS session (via dataviz_read_context or via MCP resources/read) before running this query. Do NOT list URIs you have not read — the goal is to confirm you have the business context (KPI definitions, table semantics, status filters) needed to write a correct query. At minimum, read dataviz://context/kpis.md and dataviz://context/data-sources.md when answering revenue/orders/cohort questions.',
        },
      },
      required: ['sql', 'acknowledged_context_read'],
    },
  },
  {
    name: 'dataviz_list_tables',
    description: 'List all available DuckDB tables with their column schemas. Use this to discover what data is available before writing queries. Before calling, you MUST first read the data-sources catalog (via dataviz_read_context or MCP resources/read) and pass the URIs in acknowledged_context_read — the live table list is verbose (hundreds of tables, many are archived A/B uploads), and the catalog tells you which ones are production-relevant.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'number', description: 'Optional: filter tables linked to a specific dashboard' },
        acknowledged_context_read: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            enum: [
              'dataviz://context/data-sources.md',
              'dataviz://skill/edikted-ba/SKILL.md',
            ],
          },
          description: 'REQUIRED. List every dataviz:// resource URI you actually loaded in THIS session (via dataviz_read_context or MCP resources/read). data-sources.md documents which DuckDB tables are production (Key DuckDB Tables section) vs archived CSV uploads — without it, the raw list is hard to interpret.',
        },
      },
      required: ['acknowledged_context_read'],
    },
  },
  {
    name: 'dataviz_describe_table',
    description: 'Get column names and types for a specific DuckDB table.',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Name of the DuckDB table' },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'dataviz_list_dashboards',
    description: 'List all dashboards with their IDs, titles, and metadata.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dataviz_get_dashboard',
    description: 'Get full dashboard configuration including widgets, filters, tabs, and calculated fields.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'number', description: 'Dashboard ID' },
      },
      required: ['dashboard_id'],
    },
  },
  {
    name: 'dataviz_create_dashboard',
    description: 'Create a new canvas dashboard with title, description, and optional business context. business_context_md is REQUIRED and should describe what the dashboard answers, who its audience is, key KPIs/columns, source tables, and any caveats.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Dashboard title' },
        description: { type: 'string', description: 'Short one-line dashboard description' },
        business_context_md: { type: 'string', description: 'Markdown describing the business context: what question the dashboard answers, who it serves, KPI definitions, source tables/queries used, and caveats. This persists with the dashboard so future agents can read it before editing.' },
      },
      required: ['title', 'business_context_md'],
    },
  },
  {
    name: 'dataviz_save_dashboard',
    description: 'Save/update a dashboard. Sends the full payload (widgets, mobile_widgets, filters, tabs, calculatedFields, columnAliases, business_context_md). Uses chunked upload to bypass WAF limits. Whenever you change a dashboard\'s structure or queries, also update business_context_md so it never goes stale.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'number', description: 'Dashboard ID to update' },
        title: { type: 'string', description: 'Dashboard title' },
        description: { type: 'string', description: 'Dashboard description' },
        business_context_md: { type: 'string', description: 'Markdown describing the business context. Update whenever the dashboard\'s purpose, KPIs, or sources change.' },
        widgets: { type: 'array', description: 'Array of widget objects (desktop layout)' },
        mobile_widgets: { type: 'array', description: 'Optional mobile layout overlay. Each entry: {id, x, y, w, h}. Widget id must exist in widgets[]. If omitted, client auto-generates from desktop on render.' },
        globalFilters: { type: 'object', description: 'Global filter configuration' },
        relationships: { type: 'array', description: 'Table relationships' },
        tabs: { type: 'array', description: 'Tab names' },
        calculatedFields: { type: 'object', description: 'Calculated fields by table name' },
        columnAliases: { type: 'object', description: 'Column alias mappings' },
      },
      required: ['dashboard_id'],
    },
  },
  {
    name: 'dataviz_extract_source',
    description: 'Trigger a data source extract (refresh from PostgreSQL to DuckDB). Returns immediately with a runId — use dataviz_extract_status to poll for completion. Optional skip_if_fresh_minutes: when the source already had a successful extract within that window (e.g. it is on an hourly cron shared with another pipeline), the backend skips the redundant run and returns { skipped: true, reason: "fresh"|"in_progress", lastRefreshedAt } instead of a runId.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: { type: 'number', description: 'Data source ID to extract' },
        skip_if_fresh_minutes: { type: 'number', description: 'Optional. Skip the extract if the last successful run completed within this many minutes (also skips when a run is already in progress); response then has skipped:true + lastRefreshedAt. Omit to always extract.' },
      },
      required: ['source_id'],
    },
  },
  {
    name: 'dataviz_extract_status',
    description: 'Check the status of recent extract runs. Use after dataviz_extract_source to poll for completion.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent runs to return (default: 10)' },
      },
    },
  },
  {
    name: 'dataviz_list_sources',
    description: 'List all configured data sources with their IDs, names, types, and schedules. Before calling, you MUST first read the data-sources catalog (via dataviz_read_context or MCP resources/read) and pass the URIs in acknowledged_context_read — the live list is large (260+ rows including archived CSV uploads); the catalog tells you which sources are production catch-alls vs embedded vs archive, and flags legacy-named sources.',
    inputSchema: {
      type: 'object',
      properties: {
        acknowledged_context_read: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            enum: [
              'dataviz://context/data-sources.md',
              'dataviz://skill/edikted-ba/SKILL.md',
            ],
          },
          description: 'REQUIRED. List every dataviz:// resource URI you actually loaded in THIS session (via dataviz_read_context or MCP resources/read). data-sources.md is the inventory of production postgresql + ga4 sources with their ownership/schedule context — without it, the raw list of 260 rows is hard to interpret.',
        },
      },
      required: ['acknowledged_context_read'],
    },
  },
  {
    name: 'dataviz_list_connections',
    description: 'List reusable database connections (the shared {host, port, user, password} primitive that data sources can reference). Use the returned id with dataviz_create_source({ connection_id }) to spin up a new source that points at an existing cluster without re-entering credentials. Credentials are never returned — passwords are masked server-side.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dataviz_create_source',
    description: 'Create a new data source. Two modes:\n\n1. REUSE AN EXISTING CONNECTION (preferred, no credentials in chat): pass `connection_id` from dataviz_list_connections plus `name`, `type` (must match the connection\'s type), and optional `schedule` / `business_context`. Leave `config` empty — the extract pipeline reads creds fresh from the connection on each run, so password rotations cascade automatically.\n\n2. INLINE CREDENTIALS: pass full `config`. For type="postgresql": {host, port, database, user, password, ssl?}. For type="ga4" with env defaults configured (GA4_PROPERTY_ID + GA4_SERVICE_ACCOUNT_KEY_FILE), pass config={}; for per-source GA4 override: {propertyId, serviceAccountKey}.\n\nPIPELINE MODE (preferred for agent reports): also pass `sql` — the extract query is created in the SAME call as a standalone query owned by the source (NO dashboard involved), and the response includes the DuckDB table name to use in the report. Then run dataviz_extract_source to materialize it.\n\nReturns the new source id (+ query id and duckdb_table in pipeline mode).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Source display name' },
        type: { type: 'string', enum: ['postgresql', 'csv', 'google_sheets', 'ga4', 'mysql'], description: 'Source type. When connection_id is set, must match the connection\'s type.' },
        connection_id: { type: 'number', description: 'Optional. Id from dataviz_list_connections to reuse. When set, `config` must be empty.' },
        config: { type: 'object', description: 'Source-specific config (only when connection_id is NOT set). Empty {} for env-default GA4. PG: {host, port, database, user, password}. GA4 override: {propertyId, serviceAccountKey}.' },
        schedule: { type: 'string', description: 'Refresh schedule: none / 5m / 15m / 1h / 6h / 24h or raw cron. Default none. GA4 sources should stay at 24h to respect property quotas.' },
        business_context: { type: 'string', description: 'Optional human-readable note explaining what this source is for.' },
        sql: { type: 'string', description: 'Optional (postgresql/ga4). Extract SQL — creates a standalone pipeline query with the source in one call, no dashboard needed. Response includes the DuckDB table name.' },
        query_name: { type: 'string', description: 'Optional query name override for pipeline mode (defaults to source name; letters/numbers/underscores/hyphens/spaces only — it becomes part of the DuckDB table name).' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'dataviz_create_query',
    description: 'Create a dashboard query linked to a source. For postgresql sources, sql_text is the SELECT statement that runs at extract time. For ga4 sources, sql_text is a JSON spec like {"dimensions":["date"],"metrics":["activeUsers","newUsers"],"dateRange":{"startDate":"30daysAgo","endDate":"yesterday"}}. The output materializes as DuckDB table "query_{returned_query_id}_{name}". Backend auto-triggers an extract after create. Optional incremental config: when enabled, only rows where `column >= NOW() - lookback_days` are pulled from PG each refresh, and just that window is swapped in DuckDB (first extract still does a full load).',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'number', description: 'Dashboard ID that owns this query' },
        source_id: { type: 'number', description: 'Existing source id to query against' },
        name: { type: 'string', description: 'Query name (also feeds the DuckDB table suffix)' },
        sql_text: { type: 'string', description: 'SQL for PG sources, or JSON spec string for GA4 sources' },
        incremental: {
          type: 'object',
          description: 'Optional incremental window-replace config. Omit for full-refresh on every extract.',
          properties: {
            enabled:       { type: 'boolean', description: 'Set true to enable window-replace mode.' },
            column:        { type: 'string', description: 'Timestamp/date column in the query output. Must appear at the top-level SELECT.' },
            lookback_days: { type: 'number', description: 'How many days of recent data to re-extract on each refresh (e.g. 14, 30, 60).' },
          },
        },
      },
      required: ['dashboard_id', 'source_id', 'name', 'sql_text'],
    },
  },
  {
    name: 'dataviz_update_query',
    description: 'Update an existing query — name, SQL, or incremental config. Pass only the fields you want to change. Pass `incremental: { enabled: false }` to clear incremental mode.\n\nTwo addressing modes:\n1. Dashboard-owned query: pass `dashboard_id` + `query_id`.\n2. STANDALONE pipeline query (created via dataviz_create_source with `sql`): pass `source_id` only — updates the source\'s single query. Name is immutable in this mode (it is baked into the DuckDB table name).',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'number', description: 'Dashboard ID that owns the query (mode 1)' },
        query_id:     { type: 'number', description: 'Query ID to update (mode 1)' },
        source_id:    { type: 'number', description: 'Source ID whose standalone query to update (mode 2 — omit dashboard_id/query_id)' },
        name:         { type: 'string', description: 'New query name (optional; mode 1 only)' },
        sql_text:     { type: 'string', description: 'New SQL text (optional)' },
        incremental:  {
          type: 'object',
          description: 'Optional. Same shape as in dataviz_create_query. Pass `{ enabled: false }` to clear.',
          properties: {
            enabled:       { type: 'boolean' },
            column:        { type: 'string' },
            lookback_days: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'dataviz_delete_query',
    description: 'Delete a dashboard query and its DuckDB output table.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'number', description: 'Dashboard ID that owns the query' },
        query_id: { type: 'number', description: 'Query ID to delete' },
      },
      required: ['dashboard_id', 'query_id'],
    },
  },
  {
    name: 'dataviz_ga4_status',
    description: 'Check whether the backend has a default GA4 connection wired via env vars. Returns { propertyConfigured, keyConfigured, propertyId, clientEmail }. Use this before creating GA4 sources with config={} to confirm the analyst can rely on env defaults.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dataviz_upload_csv',
    description: 'Upload a CSV or TSV file as a first-class data source. Creates a DuckDB table "query_{id}_{name}" that can be joined with any other table via the Relations UI. Use this for analyst-supplied config data (A/B maps, price tiers, static dimension lookups, seed lists, etc). Up to 100MB, 500 columns, 10M rows. Prefer this over INSERT/VALUES SQL — those hit an 8KB request body cap.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name for the source; also used as the DuckDB table suffix.' },
        file_path: { type: 'string', description: 'Absolute path to the CSV or TSV file on disk. The tool reads + POSTs it as multipart/form-data.' },
        replace_source_id: { type: 'number', description: 'Optional. When set, replaces an existing CSV source with this id (keeps table name, flushes cache).' },
      },
      required: ['name', 'file_path'],
    },
  },
  {
    name: 'dataviz_upload_report',
    description: 'Upload or update a dynamic JSX report (compiled server-side, served at /report/{slug}; chunked upload for large files). To UPDATE an existing report you MUST first call dataviz_get_report_source so your edit is based on the latest version — the uploader then sends base_hash automatically and the server 3-way-merges any concurrent edits. Updating without a fetched base is refused (would risk overwriting another editor).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'URL-friendly report slug (e.g. "daily-sales")' },
        title: { type: 'string', description: 'Report title' },
        description: { type: 'string', description: 'Report description' },
        jsx_source: { type: 'string', description: 'Full JSX source code of the report component' },
        base_hash: { type: 'string', description: 'Optional. content_hash the edit is based on. Usually omitted — taken from the prior dataviz_get_report_source automatically.' },
      },
      required: ['slug', 'jsx_source'],
    },
  },
  {
    name: 'dataviz_get_report_source',
    description: 'Fetch the current JSX source of a report plus its version and content_hash. ALWAYS call this before editing/updating an existing report: it gives you the latest source to edit and lets dataviz_upload_report send the correct base_hash, preventing silent overwrites of other editors.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Report slug (e.g. "daily-sales")' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'dataviz_send_report',
    description: 'Generate a PDF of a dashboard and email it to recipients. Requires SMTP to be configured on the server.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'number', description: 'Dashboard ID to render as PDF' },
        report_slug: { type: 'string', description: 'Or: report slug to render as PDF (use one or the other)' },
        to: { type: 'array', items: { type: 'string' }, description: 'Array of email addresses' },
        subject: { type: 'string', description: 'Optional email subject' },
        message: { type: 'string', description: 'Optional email body message' },
        tabs: { type: 'string', description: 'Comma-separated tabs for multi-page reports (e.g. "performance,daily,weekly,monthly"). Report-slug only.' },
        auto_dates: { type: 'boolean', description: 'When true, apply tab-aware default date ranges (performance=yesterday, daily=30D, weekly=12W, monthly=4M). Report-slug only.' },
        fit: { type: 'string', description: '"page" fits each tab to one A4 landscape page (Tableau-style). Default "auto".' },
      },
      required: ['to'],
    },
  },
  {
    name: 'dataviz_set_environment',
    description: 'Switch which Dataviz environment every dataviz_* tool targets: "prod", "staging", or a full https:// base URL. Persists to the local credentials file and re-authenticates on the next call. Local plugin only (no-op on the remote MCP).',
    inputSchema: {
      type: 'object',
      properties: {
        environment: { type: 'string', description: '"prod", "staging", or a full https:// base URL' },
      },
      required: ['environment'],
    },
  },
];

// ── Tool Handlers ──────────────────────────────────────────────

async function chunkedUploadDashboard(dashboardId, payload) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64');
  const CHUNK_SIZE = 8000;
  const totalParts = Math.ceil(b64.length / CHUNK_SIZE);

  for (let i = 0; i < totalParts; i++) {
    const chunk = b64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await apiJson(`/api/dashboard-canvas/${dashboardId}/chunk`, {
      method: 'POST',
      body: JSON.stringify({ chunk, part: i + 1, total: totalParts }),
    });
  }

  return apiJson(`/api/dashboard-canvas/${dashboardId}/chunk/complete`, {
    method: 'POST',
    body: '{}',
  });
}

async function chunkedUploadReport(slug, title, description, jsxSource, baseHash) {
  // Gzip the source before base64-encoding the chunks. AWS WAF managed
  // SQL-injection rules base64-decode bodies for inspection but don't gunzip,
  // so report code containing SELECT/SUM/WHERE etc. stays invisible to them.
  // CHUNK_SIZE 4000 keeps each request body well under the 8 KB WAF body cap.
  const { gzipSync } = await import('node:zlib');
  const gz = gzipSync(Buffer.from(jsxSource, 'utf-8'));
  const b64 = gz.toString('base64');
  const CHUNK_SIZE = 4000;
  const totalParts = Math.ceil(b64.length / CHUNK_SIZE);

  for (let i = 0; i < totalParts; i++) {
    const chunk = b64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await apiJson(`/api/reports/${slug}/chunk`, {
      method: 'POST',
      body: JSON.stringify({ chunk, part: i + 1, total: totalParts }),
    });
  }

  // base_hash = fingerprint of the source this edit was based on. The server
  // requires it on updates and uses it to 3-way-merge concurrent edits instead
  // of silently overwriting. Use apiFetch (not apiJson) so we can read 428/409.
  const completeBody = { title, description, compressed: 'gzip' };
  if (baseHash != null) completeBody.base_hash = baseHash;
  const res = await apiFetch(`/api/reports/${slug}/chunk/complete`, {
    method: 'POST',
    body: JSON.stringify(completeBody),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export async function handleTool(name, args) {
  switch (name) {
    case 'dataviz_set_environment': {
      if (getRequestContext()) {
        throw new Error('dataviz_set_environment is only available in the local plugin — the remote MCP is pinned to one environment.');
      }
      const url = setEnvironment(args.environment);
      // Prove the switch works end-to-end: authenticate + touch a cheap endpoint.
      try {
        const tables = await apiJson('/api/extract/tables');
        const n = (tables.tables || []).filter((t) => t.table_name.startsWith('query_')).length;
        return `Now targeting ${url} — authenticated OK, ${n} data tables visible.`;
      } catch (e) {
        return `Now targeting ${url}, but the verification call failed: ${e.message}\nIf this is a credentials problem, update email/password in the credentials file. Switch back with dataviz_set_environment("prod").`;
      }
    }
    case 'dataviz_read_context': {
      if (!args.uri || typeof args.uri !== 'string') {
        throw new Error('uri is required (e.g. "dataviz://context/kpis.md")');
      }
      const result = readResource(args.uri);
      return result.contents[0].text;
    }

    case 'dataviz_query': {
      const ack = args.acknowledged_context_read;
      if (!Array.isArray(ack) || ack.length === 0) {
        throw new Error(
          'acknowledged_context_read is required and must list at least one dataviz:// URI you have read in this session. ' +
          'Call dataviz_read_context({ uri: "dataviz://context/kpis.md" }) (and any other relevant URI like data-sources.md or skill/edikted-ba/SKILL.md), then retry dataviz_query with those URIs in acknowledged_context_read.'
        );
      }
      const data = await apiJson('/api/extract/query-duck', {
        method: 'POST',
        body: JSON.stringify({ sql: args.sql }),
      });
      const rows = data.data || data.rows || [];
      return `${rows.length} rows returned (${data.query_time_ms || 0}ms)\n\n${JSON.stringify(rows, null, 2)}`;
    }

    case 'dataviz_list_tables': {
      const ackTables = args.acknowledged_context_read;
      if (!Array.isArray(ackTables) || ackTables.length === 0) {
        throw new Error(
          'acknowledged_context_read is required and must list at least one dataviz:// URI you have read in this session. ' +
          'Call dataviz_read_context({ uri: "dataviz://context/data-sources.md" }) first to learn which tables are production vs archived, then retry dataviz_list_tables with that URI in acknowledged_context_read.'
        );
      }
      const url = args.dashboard_id
        ? `/api/extract/tables?dashboard_id=${args.dashboard_id}`
        : '/api/extract/tables';
      const data = await apiJson(url);
      const tables = data.tables || [];
      return tables.map(t => `${t.table_name} (${t.row_count ?? '?'} rows)`).join('\n') || 'No tables found';
    }

    case 'dataviz_describe_table': {
      const data = await apiJson(`/api/extract/tables/${encodeURIComponent(args.table_name)}`);
      const cols = data.columns || [];
      return cols.map(c => `${c.column_name} (${c.data_type})`).join('\n') || 'No columns found';
    }

    case 'dataviz_list_dashboards': {
      const data = await apiJson('/api/dashboards');
      const dbs = data.dashboards || [];
      return dbs.map(d => `[${d.id}] ${d.title}`).join('\n') || 'No dashboards';
    }

    case 'dataviz_get_dashboard': {
      const data = await apiJson(`/api/dashboard-canvas/${args.dashboard_id}`);
      return JSON.stringify({
        id: data.id,
        title: data.title,
        description: data.description,
        business_context_md: data.business_context_md || null,
        widgets: (data.widgets || []).length,
        tabs: data.tabs || [],
        calculatedFields: data.calculatedFields || {},
        columnAliases: data.columnAliases || {},
        queries: (data.queries || []).map(q => ({ id: q.id, name: q.name, source_id: q.source_id })),
      }, null, 2);
    }

    case 'dataviz_create_dashboard': {
      if (!args.business_context_md || !String(args.business_context_md).trim()) {
        throw new Error('business_context_md is required. Describe the dashboard purpose, audience, KPIs, source tables, and caveats in markdown so future agents understand the context.');
      }
      const data = await apiJson('/api/dashboard-canvas', {
        method: 'POST',
        body: JSON.stringify({
          title: args.title,
          description: args.description || '',
          business_context_md: args.business_context_md,
        }),
      });
      const id = data.dashboard?.id || data.id;
      return `Dashboard created: ID=${id}, title="${args.title}"\nURL: ${getBaseUrl()}/canvas/${id}`;
    }

    case 'dataviz_save_dashboard': {
      const { dashboard_id, ...payload } = args;
      const json = JSON.stringify(payload);
      // Use chunked upload for large payloads
      if (json.length > 15000) {
        const data = await chunkedUploadDashboard(dashboard_id, payload);
        return `Dashboard ${dashboard_id} saved (chunked upload). ${data.ok ? 'Success' : 'Failed'}`;
      }
      const data = await apiJson(`/api/dashboard-canvas/${dashboard_id}`, {
        method: 'PUT',
        body: json,
      });
      return `Dashboard ${dashboard_id} saved. ${data.ok ? 'Success' : 'Failed'}`;
    }

    case 'dataviz_extract_source': {
      const body = {};
      if (args.skip_if_fresh_minutes != null) body.skipIfFreshMinutes = args.skip_if_fresh_minutes;
      const data = await apiJson(`/api/extract/source/${args.source_id}`, {
        method: 'POST',
        ...(Object.keys(body).length ? { body: JSON.stringify(body) } : {}),
      });
      if (data.skipped) {
        return data.reason === 'in_progress'
          ? `Extract skipped: a run is already in progress (runId=${data.runId}, started ${data.startedAt}).`
          : `Extract skipped: source ${args.source_id} is fresh — last successful refresh ${data.lastRefreshedAt} (${data.ageMinutes} min ago, window ${data.skipIfFreshMinutes} min). runId=${data.runId}`;
      }
      return `Extract triggered: runId=${data.runId}, status=${data.status}\n${data.message || ''}`;
    }

    case 'dataviz_extract_status': {
      const data = await apiJson(`/api/extract/log?limit=${args.limit || 10}`);
      const runs = data.runs || [];
      return runs.map(r =>
        `[${r.id}] source=${r.source_id} (${r.source_name || '?'}) status=${r.status} ` +
        `tables=${r.tables_count} rows=${r.total_rows} duration=${r.duration_ms}ms` +
        (r.error_message ? ` error="${r.error_message}"` : '')
      ).join('\n') || 'No extract runs';
    }

    case 'dataviz_list_sources': {
      const ackSources = args.acknowledged_context_read;
      if (!Array.isArray(ackSources) || ackSources.length === 0) {
        throw new Error(
          'acknowledged_context_read is required and must list at least one dataviz:// URI you have read in this session. ' +
          'Call dataviz_read_context({ uri: "dataviz://context/data-sources.md" }) first to learn the production source inventory, then retry dataviz_list_sources with that URI in acknowledged_context_read.'
        );
      }
      const data = await apiJson('/api/sources');
      const sources = data.sources || data || [];
      return (Array.isArray(sources) ? sources : []).map(s =>
        `[${s.id}] ${s.name} (${s.type}) schedule=${s.schedule || 'none'}`
      ).join('\n') || 'No sources';
    }

    case 'dataviz_list_connections': {
      const data = await apiJson('/api/connections');
      const connections = data.connections || data || [];
      return (Array.isArray(connections) ? connections : []).map(c =>
        `[${c.id}] ${c.name} (${c.type}) sources=${c.source_count ?? 0}`
      ).join('\n') || 'No connections';
    }

    case 'dataviz_create_source': {
      const body = {
        name: args.name,
        type: args.type,
        config: args.config || {},
        schedule: args.schedule || 'none',
      };
      if (args.connection_id != null) body.connection_id = args.connection_id;
      if (args.business_context) body.business_context = args.business_context;
      if (args.sql != null) body.sql = args.sql;
      if (args.query_name) body.query_name = args.query_name;
      const data = await apiJson('/api/sources', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const src = data.source || data;
      const connLine = src.connection_id ? `, connection_id=${src.connection_id}` : '';
      const pipeLine = data.duckdb_table
        ? `\nStandalone pipeline query: id=${data.query.id} (no dashboard)\nOutput DuckDB table: ${data.duckdb_table}\nRun dataviz_extract_source({ source_id: ${src.id} }) to materialize it.`
        : '';
      return `Source created: id=${src.id}, name="${src.name}", type=${src.type}, schedule=${src.schedule || 'none'}${connLine}${pipeLine}`;
    }

    case 'dataviz_create_query': {
      const body = {
        name: args.name,
        sql: args.sql_text,
        sourceId: args.source_id,
      };
      if (args.incremental && typeof args.incremental === 'object') {
        body.incremental = {
          enabled: !!args.incremental.enabled,
          column: args.incremental.column || null,
          lookbackDays: args.incremental.lookback_days ?? null,
        };
      }
      const data = await apiJson(`/api/dashboard-canvas/${args.dashboard_id}/queries`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const q = data.query || data;
      const tableName = q.name ? `query_${q.id}_${q.name.replace(/[^a-zA-Z0-9_]/g, '_')}` : `query_${q.id}`;
      const incLine = q.incremental_enabled
        ? `\nIncremental: ${q.incremental_column} ≥ NOW()-${q.incremental_lookback_days}d (window-replace)`
        : '';
      return `Query created: id=${q.id}, name="${q.name}", source_id=${q.source_id}\nOutput DuckDB table: ${tableName}${incLine}\nAuto-extract triggered — poll dataviz_extract_status to confirm.`;
    }

    case 'dataviz_update_query': {
      const { dashboard_id, query_id, source_id, name, sql_text, incremental } = args;

      // Mode 2 — standalone pipeline query, addressed by its source.
      if (source_id != null && !dashboard_id && !query_id) {
        const body = {};
        if (sql_text !== undefined) body.sql_text = sql_text;
        if (incremental !== undefined && incremental !== null) {
          body.incremental_enabled = !!incremental.enabled;
          if (incremental.column !== undefined) body.incremental_column = incremental.column;
          if (incremental.lookback_days !== undefined) body.incremental_lookback_days = incremental.lookback_days;
        }
        if (incremental === null) body.incremental_enabled = false;
        const data = await apiJson(`/api/sources/${source_id}/query`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        const q = data.query || {};
        return `Standalone query ${q.id} updated (source ${source_id}). DuckDB table: ${data.duckdb_table}. Run dataviz_extract_source({ source_id: ${source_id} }) to re-materialize.`;
      }

      if (!dashboard_id || !query_id) {
        throw new Error('Pass dashboard_id + query_id (dashboard-owned) OR source_id alone (standalone pipeline query)');
      }
      const body = {};
      if (name !== undefined) body.name = name;
      if (sql_text !== undefined) body.sql = sql_text;
      if (incremental !== undefined) {
        body.incremental = incremental === null
          ? { enabled: false }
          : {
              enabled: !!incremental.enabled,
              column: incremental.column || null,
              lookbackDays: incremental.lookback_days ?? null,
            };
      }
      const data = await apiJson(`/api/dashboard-canvas/${dashboard_id}/queries/${query_id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const q = data.query || {};
      const incLine = q.incremental_enabled
        ? `incremental: ${q.incremental_column} ≥ NOW()-${q.incremental_lookback_days}d`
        : 'incremental: off';
      return `Query ${query_id} updated. name="${q.name}", ${incLine}. Re-extract triggered.`;
    }

    case 'dataviz_delete_query': {
      await apiFetch(`/api/dashboard-canvas/${args.dashboard_id}/queries/${args.query_id}`, {
        method: 'DELETE',
      });
      return `Query ${args.query_id} deleted from dashboard ${args.dashboard_id}.`;
    }

    case 'dataviz_ga4_status': {
      const data = await apiJson('/api/sources/ga4/status');
      return JSON.stringify(data, null, 2);
    }

    case 'dataviz_upload_csv': {
      const { readFile } = await import('node:fs/promises');
      const { basename } = await import('node:path');
      if (!args.file_path) throw new Error('file_path is required');
      if (!args.name) throw new Error('name is required');
      const buf = await readFile(args.file_path);
      const filename = basename(args.file_path);

      // ALB/WAF caps bodies at ~8 KB regardless of Content-Type. For anything
      // bigger than a few rows, chunk the file as base64 JSON POSTs (each
      // chunk ≤ ~5 KB raw / ~6.7 KB base64 → enclosing JSON body safely under
      // the WAF threshold). Tiny files still use the one-shot multipart path.
      const MULTIPART_SAFE_LIMIT = 4000; // bytes — stay well below 8 KB cap

      if (buf.length <= MULTIPART_SAFE_LIMIT) {
        const mime = filename.toLowerCase().endsWith('.tsv') ? 'text/tab-separated-values' : 'text/csv';
        const form = new FormData();
        form.append('name', args.name);
        form.append('file', new Blob([buf], { type: mime }), filename);
        const path = args.replace_source_id
          ? `/api/sources/csv/${args.replace_source_id}/replace`
          : '/api/sources/csv';
        const token = await getToken();
        const res = await fetch(`${getBaseUrl()}${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`CSV upload failed (${res.status}): ${data.error || 'unknown'}${data.details ? ' — ' + data.details : ''}`);
        const src = data.source || {};
        const cols = (data.columns || []).map(c => `${c.name}:${c.type}`).join(', ');
        return `CSV source ${args.replace_source_id ? 'replaced' : 'uploaded'}: id=${src.id}, table_name="${data.table_name}", rows=${data.row_count}, cols=${(data.columns||[]).length}\nColumns: ${cols}\nJoin via Relations UI, or query directly: SELECT * FROM "${data.table_name}" LIMIT 10`;
      }

      // Chunked path — parallel workers for speed
      const b64 = buf.toString('base64');
      const CHUNK_SIZE = 5000; // ~5 KB b64 per chunk
      const totalParts = Math.ceil(b64.length / CHUNK_SIZE);
      const CONCURRENCY = 6; // 6 parallel workers — ~6× faster than sequential

      const initBody = { name: args.name, filename, total_parts: totalParts };
      if (args.replace_source_id) initBody.replace_source_id = args.replace_source_id;
      const init = await apiJson('/api/sources/csv/chunk/init', {
        method: 'POST',
        body: JSON.stringify(initBody),
      });
      const uploadId = init.upload_id;

      // Worker pool
      let nextIdx = 0;
      let failed = null;
      const sendOne = async (idx) => {
        const chunk = b64.slice(idx * CHUNK_SIZE, (idx + 1) * CHUNK_SIZE);
        const maxRetry = 3;
        for (let attempt = 1; attempt <= maxRetry; attempt++) {
          try {
            await apiJson('/api/sources/csv/chunk', {
              method: 'POST',
              body: JSON.stringify({ upload_id: uploadId, part: idx + 1, chunk }),
            });
            return;
          } catch (e) {
            if (attempt === maxRetry) throw e;
            await new Promise(r => setTimeout(r, 500 * attempt));
          }
        }
      };
      const worker = async () => {
        while (!failed) {
          const idx = nextIdx++;
          if (idx >= totalParts) return;
          try { await sendOne(idx); } catch (e) { failed = e; return; }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (failed) throw new Error(`Chunk upload failed: ${failed.message}`);

      const data = await apiJson('/api/sources/csv/chunk/complete', {
        method: 'POST',
        body: JSON.stringify({ upload_id: uploadId }),
      });
      const src = data.source || {};
      const cols = (data.columns || []).map(c => `${c.name}:${c.type}`).join(', ');
      return `CSV source ${args.replace_source_id ? 'replaced' : 'uploaded'} (chunked, ${totalParts} parts × ${CONCURRENCY} workers): id=${src.id}, table_name="${data.table_name}", rows=${data.row_count}, cols=${(data.columns||[]).length}\nColumns: ${cols}\nJoin via Relations UI, or query directly: SELECT * FROM "${data.table_name}" LIMIT 10`;
    }

    case 'dataviz_get_report_source': {
      const data = await apiJson(`/api/reports/${encodeURIComponent(args.slug)}/source`);
      const r = data.report || {};
      reportSourceCache.set(args.slug, { version: r.version, content_hash: r.content_hash });
      return `slug=${r.slug} title="${r.title}" version=${r.version} bytes=${(r.source_jsx || '').length}\n--- source_jsx ---\n${r.source_jsx || ''}`;
    }

    case 'dataviz_upload_report': {
      const slug = args.slug;
      const cached = reportSourceCache.get(slug);
      const baseHash = args.base_hash || cached?.content_hash || null;

      const res = await chunkedUploadReport(slug, args.title || slug, args.description || '', args.jsx_source, baseHash);

      if (res.status === 428 && (res.body?.code === 'BASE_HASH_REQUIRED' || res.body?.code === 'BASE_REQUIRED')) {
        throw new Error(
          `Refused to avoid overwriting another editor (report "${slug}" is at v${res.body.current_version}). ` +
          `Call dataviz_get_report_source({ slug: "${slug}" }) FIRST, re-apply your change to that exact source, then retry dataviz_upload_report — ` +
          `base_hash is then sent automatically and the server 3-way-merges concurrent edits.`
        );
      }
      if (res.status === 409 && res.body?.code === 'VERSION_CONFLICT') {
        throw new Error(
          `Version conflict: "${slug}" moved to v${res.body.current_version} and your edit overlapped, so it can't be auto-merged. ` +
          `Call dataviz_get_report_source({ slug: "${slug}" }) to get the current source, re-apply your change, and retry.`
        );
      }
      if (res.status === 409 && res.body?.code === 'DUPLICATE_TITLE') {
        const existing = res.body.existing || {};
        throw new Error(
          `Title "${args.title || slug}" already used by report "${existing.slug}" (id ${existing.id}). ` +
          `To update it, upload with slug="${existing.slug}". To create new, choose a different title.`
        );
      }
      if (!res.ok) {
        throw new Error(`Upload failed (HTTP ${res.status}): ${res.body?.error || JSON.stringify(res.body)}`);
      }

      const report = res.body.report || {};
      const errors = res.body.compiled?.errors || [];
      if (errors.length > 0) {
        return `Report compilation failed:\n${errors.join('\n')}`;
      }
      // The compiled source changes server-side, so force a fresh fetch before
      // the next edit (drop the stale base) — prevents a chained stale upload.
      reportSourceCache.delete(slug);
      return `Report uploaded: slug="${report.slug}", version=${report.version}\nURL: ${getBaseUrl()}/report/${report.slug}`;
    }

    case 'dataviz_send_report': {
      const body = { to: args.to };
      if (args.dashboard_id) body.dashboardId = args.dashboard_id;
      if (args.report_slug) body.reportSlug = args.report_slug;
      if (args.subject) body.subject = args.subject;
      if (args.message) body.message = args.message;
      if (args.tabs) body.tabs = args.tabs;
      if (args.auto_dates) body.autoDates = true;
      if (args.fit) body.fit = args.fit;

      const data = await apiJson('/api/reports/send-email', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return data.ok ? `Email sent to ${args.to.join(', ')}: "${data.report}"` : `Failed: ${data.error}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
