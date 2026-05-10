# Dataviz MCP — Remote Server Instructions

You have access to the Dataviz analytics platform via this MCP server. Auth
is handled by the server (OAuth 2.1 with the user's Google identity); you
never need to ask the user for credentials, tokens, or .env files.

The repo's deeper guidance — table reference, KPI formulas, conventions —
is exposed as MCP **resources** (URIs starting with `dataviz://`). Fetch
them on demand via `resources/read` when you need detail.

The repo's task workflows (dashboard building, report uploading, daily
report pipeline, etc.) are exposed as MCP **prompts**. The user can pick
one from their client's slash menu when they want guided help.

## Always-on rules (apply to every interaction with these tools)

### Security
- Never include passwords, tokens, or credentials in code or responses
- Never expose internal IPs, connection strings, or AWS resource names

### Dashboards
- Always use `/canvas/:id` route when generating dashboard links — never `/dashboard/:id`
- Widgets in `dataviz_save_dashboard` PUT payload go at the body root level, NOT inside `canvas_layout`
- Widget IDs must be unique: prefix `w_` + random string
- For large saves (>15KB): the MCP server handles chunked upload automatically

### Data (DuckDB / `dataviz_query`)
- Primary sales table: `query_5_Daily_Orders_Aggregated`
- Cohort table: `query_11_Q_Cohorts_Online`
- GEO grouping: use the country→store CASE expression — see resource
  `dataviz://context/kpis.md` — NOT the `destination` column
- Always wrap denominators with `NULLIF(..., 0)` to prevent division by zero
- Always filter `WHERE class != 'OTHER'` to exclude test/internal data

### Reports (JSX, `dataviz_upload_report`)
- Dynamic reports use React + Recharts + the `useQueryData` hook
- Import shared deps from `window.__DATAVIZ`
- Each upload creates an automatic version history entry
- After upload, the report is reachable at `/report/{slug}`

## Discovery

### Top-level context (project-wide)
- Tables + column lists: `resources/read dataviz://context/data-sources.md`
- KPI formulas + GEO mapping: `resources/read dataviz://context/kpis.md`
- API patterns + widget types + naming: `resources/read dataviz://context/conventions.md`

### Per-skill operating instructions (read BEFORE acting on a related task)
Each skill ships its own SKILL.md with the full step-by-step playbook. **When a
user asks for something matching a skill, read its SKILL.md first** — these
files contain rules, patterns, and gotchas not duplicated here.

- Building a new code-based JSX dashboard / report:
  `resources/read dataviz://skill/agent-report/SKILL.md`
  (covers structure, DataSourceBar setup, mobile/desktop split pattern,
  dynamic-vs-static reports caveat)
- Uploading or updating an existing dynamic report:
  `resources/read dataviz://skill/upload-report/SKILL.md`
- Querying DuckDB / answering analytics questions:
  `resources/read dataviz://skill/query-data/SKILL.md`
- Refreshing data sources:
  `resources/read dataviz://skill/refresh-data/SKILL.md`
- Building a widget-based canvas dashboard:
  `resources/read dataviz://skill/create-dashboard/SKILL.md`
- Daily report pipeline (extract → PDF → email):
  `resources/read dataviz://skill/daily-report/SKILL.md`
- Visual / aesthetic direction for any dashboard:
  `resources/read dataviz://skill/frontend-design/SKILL.md`

Don't pre-read everything — fetch the SKILL.md that matches the active task.

### Business-analyst routing
- For domain-aware routing across sales, cohorts, replenishment, catalog, GA4:
  use the `edikted-ba` prompt (slash menu in the client) or read its SKILL.md
  + per-domain context under `dataviz://skill/edikted-ba/context/...`.

### Listing everything available
- `resources/list` returns every fetchable URI. `prompts/list` returns the
  guided workflows the user can pick from a slash menu. Use these when in
  doubt about what's available.
