---
name: edikted-ba
description: Business analyst context for Edikted e-commerce dashboards. Routes domain questions (sales, cohorts, replenishment, catalog, GA4) to drill-down references and provides the dashboard-building workflow. Use when creating or modifying dashboards, adding widgets, writing queries, or discussing Edikted business metrics.
---

# Edikted Business Analyst — Catalog + Router

This skill is a **router**, not a manual. It tells the agent which domain file to load for a given question. Per-table schemas, column lists, and reference SQL live in drill-down files under `context/`. SKILL.md stays small so the always-loaded context cost stays low.

All queries run via `dataviz_query` (DuckDB read-only). Dashboard CRUD via `dataviz_*` MCP tools. There is no curl / REST.

---

## Domain Router — pick ONE before answering

| Question is about… | Read | Primary tables |
|---|---|---|
| Orders, revenue, AOV, daily sales, YoY, channels, GEO, **dropship/B2B** | `context/domains/sales.md` | `query_5_Daily_Orders_Aggregated`, `query_6_Last_Year_Month_Comparison`, `query_7_New_Orders_AOV`, `query_8_Products` |
| Cohorts, retention, LTV | `context/domains/cohorts.md` | `query_11_Q_Cohorts_Online` |
| Replenishment, inventory, repeat candidates, BOM/BIS, OTW | `context/domains/replenishment.md` | `query_122_mart_repeats__wide_overview`, `query_123_mart_repeats__wide_sku`, `query_119_virtual_7d`, `query_124_n7d` |
| Catalog, style+color, SKU, sizes, suppliers | `context/domains/catalog.md` | `query_117_style_colors`, `query_118_skus`, `query_123_mart_repeats__wide_sku` |
| GA4 / web analytics — sessions, funnels, landing pages | `context/domains/ga4.md` | `query_*_ga4_*` |

**Decision rule:** read at most 1 domain file + the specific table refs it points to. Don't preload everything.

**Fallback when no router match:** call `dataviz_list_sources` — its `business_context` field is the live source-of-truth (DB, never stale). Pick the source whose business_context matches the question, then read its `context/tables/<name>.md`.

---

## Workflow — Building a Dashboard

MCP tools (`dataviz_create_dashboard`, `dataviz_save_dashboard`) **require** a `business_context_md` payload. This is the dashboard's permanent doc — future agents read it before editing.

Required steps before calling create/save:

1. **Ask the user** (if not stated):
   - what question does the dashboard answer?
   - who is the audience?
   - what date range?
2. **Pick tables** via the router above. If unsure, run `dataviz_list_sources` and read each candidate's `business_context`.
3. **Read each picked table's drill file** under `context/tables/<name>.md` for columns, joins, gotchas.
4. **Stitch `business_context_md`** using the template at `context/templates/business_context.md`.
5. **Build widgets** — see `context/conventions.md` for layout grid + widget types.
6. **Save** via `dataviz_save_dashboard` with the stitched `business_context_md`.

Skip the workflow only for ad-hoc one-off `dataviz_query` calls.

---

## Always-True Rules

- **Date column is `date`** (or table-specific). Always cast `ny_date::date` if querying source Postgres.
- **Use `NULLIF(denominator, 0)`** in every divide.
- **Filter `WHERE class != 'OTHER'`** to exclude test/internal data.
- **GEO grouping** = country→store CASE in `context/domains/sales.md`, NOT `destination` directly.
- **Routes:** dashboard editor = `/canvas/:id`. Never `/dashboard/:id`.
- **Save payload:** widgets at body root, NOT inside `canvas_layout`.

---

## Adding New Tables / Metrics

When a new extract or metric is introduced:

1. Backfill `data_sources.business_context` (DB) — single source of truth for live agents.
2. Add a row to the matching domain file (`context/domains/<x>.md`) under "Tables".
3. Create `context/tables/<query_name>.md` — schema, joins, sample SQL, gotchas.
4. If it's a new domain, add a router row above and create `context/domains/<x>.md`.
5. Update `context/templates/business_context.md` only if the doc shape changes.

Don't bloat SKILL.md. Add depth in drill files.
