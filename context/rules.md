# Dataviz Always-On Rules

Full ruleset moved out of `REMOTE_INSTRUCTIONS.md` so the session-init payload stays under client display caps. Read this whenever working with `dataviz_*` tools.

## Security
- Never include passwords, tokens, or credentials in code or responses.
- Never expose internal IPs, connection strings, or AWS resource names.

## Dashboards
- Always use `/canvas/:id` route when generating dashboard links — never `/dashboard/:id`.
- Widgets in `dataviz_save_dashboard` PUT payload go at the body root level, NOT inside `canvas_layout`.
- Widget IDs must be unique: prefix `w_` + random string.
- For large saves (>15KB): the MCP server handles chunked upload automatically.

## Reports (JSX, `dataviz_upload_report`)
- Dynamic reports use React + Recharts + the `useQueryData` hook.
- Import shared deps from `window.__DATAVIZ`.
- Each upload creates an automatic version history entry.
- After upload, the report is reachable at `/report/{slug}`.