# business_context_md template

Stitch this into the `business_context_md` field on every dashboard you create or save. Future agents read it before editing — keep it accurate, terse, dated.

```markdown
## <Dashboard Title>

**Question answered:** <one sentence>

**Audience:** <who reads this — name + role>

**Date range:** <static range OR "rolling N days from extract">

**Tables used:**
- `<query_X_name>` — <one-line purpose>
  - drill: `context/tables/<query_X_name>.md`
- `<query_Y_name>` — <one-line purpose>

**KPIs:**
- `<kpi_name>` — `<formula>` (units: <USD / qty / %>)
- `<kpi_name>` — `<formula>`

**Joins / filters:**
- `<table_a>` ↔ `<table_b>` on `<key>`
- `WHERE class != 'OTHER'` (always)
- <other domain-specific filters>

**GEO mapping:** <"none" OR "uses country→store CASE from sales.md">

**Refresh cadence:** <"24h via scheduler" OR "manual extract" OR "GA4 CSV upload">

**Caveats:**
- <recent cohorts immature / partial day / known data gap / etc.>

**Last verified:** <YYYY-MM-DD by who>
```

## Rules

- Update **Last verified** every time you touch the dashboard.
- If you add/remove widgets that change which tables are used → update **Tables used**.
- If you change a KPI formula → update **KPIs**.
- Keep it under ~30 lines. This is a memo, not a manual.

## Why this matters

The MCP `dataviz_save_dashboard` tool **rejects empty `business_context_md`** for non-trivial dashboards. The doc lives next to the dashboard in DB so it can never drift from the file system.
