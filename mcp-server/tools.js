/**
 * Tool definitions and handlers for the Dataviz MCP server.
 * Each tool wraps a Dataviz API call and returns structured results.
 */
import { apiJson, apiFetch, getBaseUrl } from './auth.js';

// ── Tool Definitions (JSON Schema) ─────────────────────────────

export const TOOLS = [
  {
    name: 'dataviz_query',
    description: 'Execute a SQL query against DuckDB (read-only analytics database). Use this to explore data, check table contents, or run ad-hoc analytics. Example: SELECT date, SUM(total_revenue) FROM query_5_Daily_Orders_Aggregated GROUP BY date ORDER BY date DESC LIMIT 10',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query to execute against DuckDB' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'dataviz_list_tables',
    description: 'List all available DuckDB tables with their column schemas. Use this to discover what data is available before writing queries.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'number', description: 'Optional: filter tables linked to a specific dashboard' },
      },
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
    description: 'Create a new canvas dashboard with title, description, and optional widgets.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Dashboard title' },
        description: { type: 'string', description: 'Dashboard description' },
      },
      required: ['title'],
    },
  },
  {
    name: 'dataviz_save_dashboard',
    description: 'Save/update a dashboard. Sends the full payload (widgets, filters, tabs, calculatedFields, columnAliases). Uses chunked upload to bypass WAF limits.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'number', description: 'Dashboard ID to update' },
        title: { type: 'string', description: 'Dashboard title' },
        description: { type: 'string', description: 'Dashboard description' },
        widgets: { type: 'array', description: 'Array of widget objects' },
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
    description: 'Trigger a data source extract (refresh from PostgreSQL to DuckDB). Returns immediately with a runId — use dataviz_extract_status to poll for completion.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: { type: 'number', description: 'Data source ID to extract' },
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
    description: 'List all configured data sources with their IDs, names, types, and schedules.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dataviz_upload_report',
    description: 'Upload or update a dynamic JSX report. The report is compiled server-side and served at /report/{slug}. Uses chunked upload for large files.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'URL-friendly report slug (e.g. "daily-sales")' },
        title: { type: 'string', description: 'Report title' },
        description: { type: 'string', description: 'Report description' },
        jsx_source: { type: 'string', description: 'Full JSX source code of the report component' },
      },
      required: ['slug', 'jsx_source'],
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
      },
      required: ['to'],
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

async function chunkedUploadReport(slug, title, description, jsxSource) {
  const b64 = Buffer.from(jsxSource).toString('base64');
  const CHUNK_SIZE = 8000;
  const totalParts = Math.ceil(b64.length / CHUNK_SIZE);

  for (let i = 0; i < totalParts; i++) {
    const chunk = b64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await apiJson(`/api/reports/${slug}/chunk`, {
      method: 'POST',
      body: JSON.stringify({ chunk, part: i + 1, total: totalParts }),
    });
  }

  return apiJson(`/api/reports/${slug}/chunk/complete`, {
    method: 'POST',
    body: JSON.stringify({ title, description }),
  });
}

export async function handleTool(name, args) {
  switch (name) {
    case 'dataviz_query': {
      const data = await apiJson('/api/extract/query-duck', {
        method: 'POST',
        body: JSON.stringify({ sql: args.sql }),
      });
      const rows = data.data || data.rows || [];
      return `${rows.length} rows returned (${data.query_time_ms || 0}ms)\n\n${JSON.stringify(rows, null, 2)}`;
    }

    case 'dataviz_list_tables': {
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
        widgets: (data.widgets || []).length,
        tabs: data.tabs || [],
        calculatedFields: data.calculatedFields || {},
        columnAliases: data.columnAliases || {},
        queries: (data.queries || []).map(q => ({ id: q.id, name: q.name, source_id: q.source_id })),
      }, null, 2);
    }

    case 'dataviz_create_dashboard': {
      const data = await apiJson('/api/dashboard-canvas', {
        method: 'POST',
        body: JSON.stringify({
          title: args.title,
          description: args.description || '',
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
      const data = await apiJson(`/api/extract/source/${args.source_id}`, {
        method: 'POST',
      });
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
      const data = await apiJson('/api/sources');
      const sources = data.sources || data || [];
      return (Array.isArray(sources) ? sources : []).map(s =>
        `[${s.id}] ${s.name} (${s.type}) schedule=${s.schedule || 'none'}`
      ).join('\n') || 'No sources';
    }

    case 'dataviz_upload_report': {
      const data = await chunkedUploadReport(
        args.slug,
        args.title || args.slug,
        args.description || '',
        args.jsx_source,
      );
      const report = data.report || {};
      const errors = data.compiled?.errors || [];
      if (errors.length > 0) {
        return `Report compilation failed:\n${errors.join('\n')}`;
      }
      return `Report uploaded: slug="${report.slug}", version=${report.version}\nURL: ${getBaseUrl()}/report/${report.slug}`;
    }

    case 'dataviz_send_report': {
      const body = { to: args.to };
      if (args.dashboard_id) body.dashboardId = args.dashboard_id;
      if (args.report_slug) body.reportSlug = args.report_slug;
      if (args.subject) body.subject = args.subject;
      if (args.message) body.message = args.message;

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
