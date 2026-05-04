# Domain: Sales / Orders / Revenue

Daily, monthly, and product-level sales analytics. Covers all channels (edikted.com, TikTok, retail, B2B/dropship).

## Tables in this domain

| Table | Purpose | Drill |
|---|---|---|
| `query_5_Daily_Orders_Aggregated` | Primary sales table — daily aggregation by destination × o_type × class × country | `context/tables/query_5_Daily_Orders_Aggregated.md` |
| `query_6_Last_Year_Month_Comparison` | Pre-built monthly YoY (matched against last-year same month) | `context/tables/query_6_Last_Year_Month_Comparison.md` |
| `query_7_New_Orders_AOV` | Lighter-weight orders view used for AOV widgets | `context/tables/query_7_New_Orders_AOV.md` |
| `query_8_Products` | Product-level line items (one row per ordered SKU on an order) | `context/tables/query_8_Products.md` |

## Core KPIs (formulas)

| KPI | Formula |
|---|---|
| Revenue | `SUM(total_revenue)` |
| Orders | `SUM(order_count)` |
| Units | `SUM(total_units)` |
| AOV | `SUM(total_revenue) / NULLIF(SUM(order_count), 0)` |
| RPU | `SUM(total_revenue) / NULLIF(SUM(total_units), 0)` |
| UPO | `SUM(total_units) / NULLIF(SUM(order_count), 0)` |
| Gross Margin | `(SUM(total_revenue) - SUM(items_cost_usd)) / NULLIF(SUM(total_revenue), 0)` |
| Discount Rate | `1 - SUM(total_revenue) / NULLIF(SUM(items_full_price), 0)` |
| BOM% | `1 - SUM(items_cost_usd) / NULLIF(SUM(total_revenue - shipping_price), 0)` |

## GEO Mapping (Country → Store)

US+ and UK+ are **store groups**, not destinations. Use this CASE:

```sql
CASE WHEN country::varchar IN (
  'US','CA','AR','BM','BR','CL','CR','EC','GP','GT','HK','MX','PA','PE','TT','SG',
  'United States','Canada','Argentina','Bermuda','Brazil','Chile','Costa Rica',
  'Ecuador','Guadeloupe','Guatemala','Hong Kong','Mexico','Panama','Peru',
  'Trinidad and Tobago','Singapore'
) THEN 'US' ELSE 'UK' END AS geo
```

US+ = served from US warehouse. UK+ = served from UK warehouse. Required for YoY comparisons that align historically.

## Order Class Hierarchy

```
ONLINE  (edikted.com, TikTok Shop, Amazon, ...)
RETAIL  (physical stores)
DROP    (B2B / wholesale / dropship)
```

Filter `WHERE class != 'OTHER'` to exclude test/internal orders.

## Common Gotchas

- **Units ≠ COUNT(\*)** → use `SUM(total_units)` (already aggregated). Source is `items_quantity`.
- **Revenue ≠ items_price** → `total_revenue` includes shipping/tax; `items_price` is product-only.
- **Don't use `order_date`** — always use `date` (extracted from `ny_date`, NY timezone).
- **Discount rate** assumes `total_revenue - shipping = items_price - discount`. Other adjustments may leak in.
- **`o_type` vs `class`** — `o_type` is the channel name (e.g. "edikted.com"), `class` is the bucket (ONLINE/RETAIL/DROP).

## Monthly aggregation pattern

Source extracts are daily. For monthly widgets use `date_trunc` in widget SQL — keeps a single `date` column so global filters work across daily + monthly:

```sql
SELECT date_trunc('month', date) AS month,
       SUM(total_revenue) AS total_revenue,
       SUM(order_count) AS order_count
FROM query_5_Daily_Orders_Aggregated
WHERE class != 'OTHER'
GROUP BY 1 ORDER BY 1
```

## When to use which table

- **Daily KPIs / time series** → `query_5_Daily_Orders_Aggregated`
- **Monthly YoY card** → `query_6_Last_Year_Month_Comparison` (already paired)
- **AOV-only widgets** → `query_7_New_Orders_AOV` (smaller, faster)
- **Top SKUs / colors / collections** → `query_8_Products`
