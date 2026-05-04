# `query_5_Daily_Orders_Aggregated`

**Domain:** sales · **Grain:** day × destination × o_type × class × country · **Refresh:** 24h · **Source:** `edktd_etl.united_orders` (joined to `stores`, `shipment_destination`)

## Columns

| Column | Type | Notes |
|---|---|---|
| `date` | DATE | order date in NY timezone (cast from `ny_date::date`) |
| `destination` | VARCHAR | distributor code (US warehouse vs UK warehouse) |
| `o_type` | VARCHAR | channel name — edikted.com / TikTok / Amazon / Retail / B2B |
| `class` | VARCHAR | bucket — ONLINE / RETAIL / DROP / OTHER (filter OTHER out) |
| `country` | VARCHAR | customer country full name |
| `order_count` | INTEGER | distinct orders |
| `total_units` | INTEGER | `SUM(items_quantity)` |
| `total_revenue` | DECIMAL | revenue including shipping/tax |
| `items_price` | DECIMAL | product-only revenue (post-discount) |
| `items_full_price` | DECIMAL | full price before discount |
| `shipping_price` | DECIMAL | shipping component |
| `items_cost_usd` | DECIMAL | COGS |
| `new_customers` | INTEGER | first-time buyers |

## Always filter

```sql
WHERE class != 'OTHER'
```

## Sample queries

### Daily revenue by class
```sql
SELECT date, class, SUM(total_revenue) AS revenue
FROM query_5_Daily_Orders_Aggregated
WHERE class != 'OTHER'
GROUP BY 1, 2 ORDER BY 1 DESC, 2;
```

### Monthly with GEO
```sql
SELECT date_trunc('month', date) AS month,
       CASE WHEN country IN ('US','CA','MX',...) THEN 'US' ELSE 'UK' END AS geo,
       SUM(total_revenue) AS revenue,
       SUM(order_count) AS orders,
       SUM(total_revenue) / NULLIF(SUM(order_count), 0) AS aov
FROM query_5_Daily_Orders_Aggregated
WHERE class != 'OTHER'
GROUP BY 1, 2 ORDER BY 1 DESC, 2;
```

(Full GEO list: `context/domains/sales.md`)

## Gotchas

- **Units = `total_units`, not COUNT(\*).**
- **Don't use `order_date`** — column is `date` (already NY-tz).
- **Shipping leak** — discount rate based on `total_revenue - shipping_price`, not raw `total_revenue`.
- **`o_type` ≠ `class`** — a single class contains many o_types.
