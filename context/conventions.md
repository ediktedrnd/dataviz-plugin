# Dataviz Conventions

## Routes
- **Canvas editor**: `/canvas/:id` — main dashboard editor with full widget support
- **Legacy viewer**: `/dashboard/:id` — does NOT render canvas widgets, do not use
- **Dynamic reports**: `/report/:slug` — code-based JSX reports
- **Always use `/canvas/:id`** when creating, editing, or linking to dashboards

## Dashboard API
- Create: `POST /api/dashboard-canvas`
- Save: `PUT /api/dashboard-canvas/:id` — widgets go at **body root level**, NOT inside `canvas_layout`
- For payloads > 15KB: use chunked upload (POST chunks, then POST complete)
- Queries: `POST /api/dashboard-canvas/:id/queries`

## Widget Types
- `kpi` — single value card with optional YoY delta
- `bar` — bar chart (vertical)
- `line` — line chart
- `composed` — mixed chart (bars + lines)
- `table` — data table with sorting/pagination
- `area` — area chart

## Widget Config Modes
1. **Builder mode**: set `measures` + `dimensions`, leave `sql` empty
   - Backend generates SQL from measures/dimensions
   - Supports calculated fields, YoY delta, period comparison
2. **Custom SQL mode**: set `sql`, leave `measures`/`dimensions` empty
   - Full control over the query
   - Config panel shows output columns (not raw table columns)

## Grid System
- 12 columns, each row = 80px height
- Widget position: `x`, `y` (grid units), `w`, `h` (grid units)
- Maximum width = 12

## Order Type Groups (sorted)
```
ONLINE:
  - edikted.com
  - TikTok Shop
  - Amazon
  - (other online channels)

RETAIL:
  - Retail stores

DROP (B2B):
  - B2B / wholesale / dropship
```

## Date Handling
- All dates in DuckDB are stored as DATE or TIMESTAMP
- Use `DATE_TRUNC('month', date)` for monthly grouping
- Use `DATE_TRUNC('week', date)` for weekly (Monday-start)
- YoY comparison: shift dates back 1 year or 364 days (weekday-aligned)

## Security Rules
- Never expose database credentials in code or prompts
- Use .env for all secrets
- Auth via JWT tokens (24h expiry)
- SSO via Google OAuth (production)
- Blocked users cannot login even via SSO

## Naming Conventions
- Dashboard IDs: integers (auto-increment)
- Widget IDs: `w_` + random alphanumeric
- Report slugs: lowercase-kebab-case (e.g. `daily-sales`)
- Table names: `query_{N}_{Description}` (e.g. `query_5_Daily_Orders_Aggregated`)
