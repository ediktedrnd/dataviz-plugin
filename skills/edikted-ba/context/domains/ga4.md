# Domain: GA4 / Web Analytics

Google Analytics 4 exports — sessions, funnels, landing pages, page transitions, country/device breakdowns.

## Discovery

GA4 tables land via daily CSV uploads. Names follow `query_*_ga4_*`. Use:

```sql
SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '%ga4%';
```

## Common patterns

| Question | Likely table |
|---|---|
| Daily KPIs (sessions, users, conversion) | `query_*_ga4_dash_daily_combined` |
| Funnel by step | `query_*_ga4_dash_funnel_30d` |
| Top landing pages | `query_*_ga4_top_landing_30d` |
| Country breakdown | `query_*_ga4_country_30d` |
| Device / OS | `query_*_ga4_device_os_30d` |
| Search vs browse | `query_*_ga4_dash_search_browse_daily` |
| PDP referrers | `query_*_ga4_pdp_referrers_30d` |
| Page-to-page transitions | `query_*_ga4_page_transitions_30d` |

## Gotchas

- **GA4 tables refresh on CSV upload**, not via the Postgres pipeline. If yesterday's data missing, re-upload the CSV from the source.
- **Column types** sometimes import as VARCHAR — cast explicitly: `CAST(sessions AS BIGINT)`.
- **Numerous duplicate-name uploads** exist (e.g. multiple `query_*_ga4_country_30d`). Pick the highest-numbered one — it's the latest.
- **GA4 sessions ≠ orders** — never join GA4 metrics to `query_5` directly. Conversion rate must be derived from GA4 alone (`transactions / sessions`).

## Drill files

Add `context/tables/query_<id>_ga4_<name>.md` per table as analysts query them. Don't pre-build all — too many.
