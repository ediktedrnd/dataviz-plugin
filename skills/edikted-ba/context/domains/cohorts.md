# Domain: Cohorts / Retention / LTV

Quarterly cohort analysis — group customers by first-order quarter, track retention + revenue at fixed day windows from acquisition.

## Tables

| Table | Purpose | Drill |
|---|---|---|
| `query_11_Q_Cohorts_Online` | Quarterly cohort retention + revenue (online only) | `context/tables/query_11_Q_Cohorts_Online.md` |

## Day Windows

Suffix conventions:
- `_d0` = first purchase (day of acquisition)
- `_d90`, `_d180`, `_d270`, `_d360`, `_d540`, `_d720`, `_d900`, `_d1080` = within X days of acquisition

Each window is **cumulative since d0**, not the standalone period.

## Core KPIs

| KPI | Formula |
|---|---|
| LTV at D0 | `SUM(total_revenue_d0) / NULLIF(SUM(customers_d0), 0)` |
| LTV at D180 | `SUM(total_revenue_d180) / NULLIF(SUM(customers_d0), 0)` |
| LTV at D360 | `SUM(total_revenue_d360) / NULLIF(SUM(customers_d0), 0)` |
| Retention D90 | `SUM(customers_d90) / NULLIF(SUM(customers_d0), 0) * 100` |
| Retention D360 | `SUM(customers_d360) / NULLIF(SUM(customers_d0), 0) * 100` |
| AOV at D0 | `SUM(total_revenue_d0) / NULLIF(SUM(orders_d0), 0)` |

**Always denominate by `customers_d0`** for LTV — never by current cohort size.

## Common Gotchas

- **"Customers at D90" is cumulative**, not "customers who ordered in days 1-90". It's "customers who ordered any time in days 0-90".
- **Recent cohorts are immature** — a Q1 cohort can't have D360 yet if today is < acquisition_quarter + 360. Filter or grey them out.
- **Online only** — table excludes retail and B2B. Don't mix with `query_5` totals.

## Slicing dimensions

- `cohort_q` (e.g. `2025-Q1`) — primary grouping
- `first_order_o_type` — channel of acquisition (edikted.com, TikTok, etc.)
- Optional GEO via the country→store mapping in `context/domains/sales.md` (if columns present)
