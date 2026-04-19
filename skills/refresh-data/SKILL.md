---
description: Refresh data sources from PostgreSQL into DuckDB. Use when data needs to be updated or when dashboards show stale data.
---

# Refresh Data

Trigger a data source extract (PostgreSQL → DuckDB) and monitor completion.

## Steps

1. **List sources** — Use `dataviz_list_sources` to show available data sources with IDs and schedules.

2. **Trigger extract** — Use `dataviz_extract_source` with the source ID. This returns immediately with a `runId`.

3. **Poll for completion** — Use `dataviz_extract_status` every 30 seconds until the run shows `status: "success"` or `"error"`.

4. **Report results** — Show tables extracted, row counts, duration, and any errors.

## Known Sources

| ID | Name | Typical Duration | Tables |
|----|------|-----------------|--------|
| 2 | Edikted Production | ~60s | 3 tables (~94K rows) |
| 4 | Edikted Production (Cohorts) | ~3min | 1 table (~33 rows) |

## Arguments

$ARGUMENTS can be:
- A source ID: `2` or `4`
- A source name: `"Edikted Production"`
- `all` — refresh all sources sequentially
- Empty — list sources and ask user which to refresh
