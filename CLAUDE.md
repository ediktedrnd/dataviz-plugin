# Dataviz Toolkit

You have access to the Dataviz analytics platform via MCP tools. Use these tools to query data, manage dashboards, and deploy reports.

## First-Time Setup (credentials)

If any `dataviz_*` MCP tool fails with a message mentioning `~/.config/dataviz/credentials.json`, the user hasn't entered their Dataviz login yet. The MCP server auto-creates a template file on first failure. Your job:

1. Tell the user — in one line — to open `~/.config/dataviz/credentials.json` and replace the `email` and `password` fields with their Dataviz credentials (same ones used at https://dataviz.edikted.tech).
2. Wait for them to confirm, then retry the tool call.

Do **not**:
- Ask them to run a setup skill, installer, or command
- Read or write to the credentials file yourself
- Request credentials in chat

Example response when creds are missing:
> Open `~/.config/dataviz/credentials.json`, replace the `email` and `password` with your Dataviz login, save, and tell me when done. I'll retry from here.

## Available Tools (via MCP)
- `dataviz_query` — Run SQL on DuckDB
- `dataviz_list_tables` / `dataviz_describe_table` — Explore table schemas
- `dataviz_list_dashboards` / `dataviz_get_dashboard` — Browse dashboards
- `dataviz_create_dashboard` / `dataviz_save_dashboard` — Build dashboards
- `dataviz_extract_source` / `dataviz_extract_status` — Refresh data
- `dataviz_list_sources` — List data sources
- `dataviz_upload_report` — Deploy JSX reports
- `dataviz_send_report` — PDF + email

## Business Context
Read these files for domain knowledge:
- @context/data-sources.md — Available tables and columns
- @context/kpis.md — KPI formulas and GEO mapping
- @context/conventions.md — API patterns, widget types, naming rules

## Rules

### Security
- NEVER include passwords, tokens, or credentials in code or responses
- Auth is handled by the MCP server via .env — you don't need to manage it
- Do not expose internal IPs, connection strings, or AWS resource names

### Dashboards
- Always use `/canvas/:id` route — never `/dashboard/:id`
- Widgets in PUT payload go at body root level, NOT inside `canvas_layout`
- For large saves (>15KB): MCP handles chunked upload automatically
- Widget IDs must be unique: `w_` + random string

### Data
- Primary sales table: `query_5_Daily_Orders_Aggregated`
- Cohort table: `query_11_Q_Cohorts_Online`
- GEO grouping: use country→store CASE (see kpis.md), NOT the `destination` column
- Always use `NULLIF` to prevent division by zero in calculated metrics
- Filter `WHERE class != 'OTHER'` to exclude test/internal data

### Reports (JSX)
- Dynamic reports use React + Recharts + `useQueryData` hook
- Import from `window.__DATAVIZ` shared dependencies
- Reports have automatic version history (saved before each update)
- Test by visiting `/report/{slug}` after upload
