# Dataviz Finance MCP

This is the **Finance Dataviz** (FP&A) at `https://dataviz.app.finance.edikted.dev` — a separate deployment from the e-commerce Dataviz, with its own users, sources and dashboards. The data is the NetSuite P&L.

## Hard rules
- No passwords, tokens, secrets, IPs, or AWS resource names in output.
- Links use the finance host: `https://dataviz.app.finance.edikted.dev/canvas/:id` for dashboards (never `/dashboard/:id`), `/report/:slug` for reports.
- The shared skills were written for the e-commerce Dataviz. Where they say `https://dataviz.edikted.tech`, use the finance host. Where they point to the `edikted-ba` skill, orders/Shopify tables, or the `class != 'OTHER'` filter — none of that exists here; use `dataviz://context/data-sources.md` and `dataviz://context/kpis.md` instead.
- Wrap denominators in `NULLIF(.., 0)`.
- Full ruleset (dashboards, reports): `dataviz://context/rules.md`.

## Read SKILL.md BEFORE acting on a matching task
- New JSX dashboard/report → `dataviz://skill/agent-report/SKILL.md`
- Upload/update dynamic report → `dataviz://skill/upload-report/SKILL.md`
- Analytics question / SQL → `dataviz://skill/query-data/SKILL.md`
- Refresh data source → `dataviz://skill/refresh-data/SKILL.md`
- Widget-based canvas dashboard → `dataviz://skill/create-dashboard/SKILL.md`
- Visual style direction → `dataviz://skill/frontend-design/SKILL.md`
- Login missing or failing → `dataviz://skill/finance-setup/SKILL.md`

## Before any query
Read `dataviz://context/data-sources.md` (the `query_1_netsuite_pnl` table, grain, intercompany, gotchas) and `dataviz://context/kpis.md` (sign convention, P&L sections, reconciliation anchors), then pass both URIs in `acknowledged_context_read`.

## Reference
- Tables + columns: `dataviz://context/data-sources.md`
- P&L definitions + sign convention: `dataviz://context/kpis.md`
- API + widget conventions: `dataviz://context/conventions.md`
