# KPI Definitions

## Core Metrics

| KPI | Formula | Source Column(s) |
|-----|---------|-----------------|
| Revenue | `SUM(total_revenue)` | total_revenue |
| Orders | `SUM(order_count)` | order_count |
| Units | `SUM(total_units)` | total_units |
| AOV (Average Order Value) | `SUM(total_revenue) / NULLIF(SUM(order_count), 0)` | total_revenue, order_count |
| RPU (Revenue Per Unit) | `SUM(total_revenue) / NULLIF(SUM(total_units), 0)` | total_revenue, total_units |
| UPO (Units Per Order) | `SUM(total_units) / NULLIF(SUM(order_count), 0)` | total_units, order_count |
| Gross Margin | `(SUM(total_revenue) - SUM(items_cost_usd)) / NULLIF(SUM(total_revenue), 0)` | total_revenue, items_cost_usd |
| Discount Rate | `1 - SUM(total_revenue) / NULLIF(SUM(items_full_price), 0)` | total_revenue, items_full_price |
| New Customers | `SUM(new_customers)` | new_customers |
| Avg Daily Revenue | `SUM(total_revenue) / NULLIF(COUNT(DISTINCT date), 0)` | total_revenue, date |
| Avg Daily Orders | `SUM(order_count) / NULLIF(COUNT(DISTINCT date), 0)` | order_count, date |

## GEO Mapping (Country → Store)

US+ and UK+ are **store groups**, not geographic destinations. Use this CASE statement:

```sql
CASE WHEN country::varchar IN (
  'US','CA','AR','BM','BR','CL','CR','EC','GP','GT','HK','MX','PA','PE','TT','SG',
  'United States','Canada','Argentina','Bermuda','Brazil','Chile','Costa Rica',
  'Ecuador','Guadeloupe','Guatemala','Hong Kong','Mexico','Panama','Peru',
  'Trinidad and Tobago','Singapore'
) THEN 'US' ELSE 'UK' END AS geo
```

- **US+** = Countries served from the US warehouse/site
- **UK+** = Countries served from the UK warehouse/site
- This mapping aligns historical data correctly for YoY comparisons

## Order Class Hierarchy

```
ONLINE (edikted.com, TikTok Shop, etc.)
RETAIL (physical stores)
DROP (B2B / wholesale / dropship)
```

## Cohort Metrics (query_11_Q_Cohorts_Online)

| KPI | Formula |
|-----|---------|
| LTV at D0 | `SUM(total_revenue_d0) / NULLIF(SUM(customers_d0), 0)` |
| LTV at D180 | `SUM(total_revenue_d180) / NULLIF(SUM(customers_d0), 0)` |
| Retention D90 | `SUM(customers_d90) / NULLIF(SUM(customers_d0), 0) * 100` |
| Retention D360 | `SUM(customers_d360) / NULLIF(SUM(customers_d0), 0) * 100` |
| AOV at D0 | `SUM(total_revenue_d0) / NULLIF(SUM(orders_d0), 0)` |

Suffix meaning: `_d0` = first purchase, `_d90` = within 90 days, `_d180` = within 180 days, etc.
