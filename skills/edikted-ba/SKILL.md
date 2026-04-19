---
name: edikted-ba
description: Business analyst context for Edikted e-commerce dashboards. Contains domain knowledge, metric definitions, reference SQL queries, and data model relationships. Use when creating or modifying dashboards, adding widgets, writing queries, or discussing Edikted business metrics like orders, revenue, protection, items, or destinations.
---

# Edikted Business Analyst Context

Domain knowledge for building dashboards on the Edikted e-commerce platform. This skill is additive — new queries and metrics may be added over time.

All queries run via the `dataviz_query` MCP tool (DuckDB read-only) or power widgets in canvas dashboards. There is no curl / REST — the plugin handles the API layer.

---

## Core Data Model

### Key Tables (Production Postgres, extracted into DuckDB)

| Table | Schema | Purpose |
|-------|--------|---------|
| `edktd_etl.united_orders` | ETL | Unified orders from all channels |
| `edktd_history.protection_view_v2` | History | Protection/warranty line items |
| `stores` | public | Store name → distributor mapping |
| `shipment_destination` | public | Distributor → destination code mapping |

### Important Joins

```
stores st ON u.store = st.name
shipment_destination sd ON st.distributor = sd.distributor AND sd.main_destination = true
```

This join chain resolves an order's **destination** (country/region code) via `store → distributor → shipment_destination`.

### Date Column Convention

**Always use `ny_date`** (New York timezone date) as the canonical date field, aliased as `date` in extracts.
- `united_orders.ny_date` — order date in NY timezone
- `protection_view_v2.ny_date` — protection record date in NY timezone
- Do NOT use `order_date`, `created_at`, or other date columns for dashboards.

---

## Reference Queries (source-side, PostgreSQL)

### 1. Orders — Daily by Destination

The base query for all order-related metrics. Pre-aggregated daily by destination.

```sql
SELECT
    u.ny_date AS date,
    sd.code AS destination,
    COUNT(*) AS order_count,
    SUM(u.items_quantity)::numeric(14, 0) AS total_items,
    SUM(u.total_revenue)::numeric(14, 2) AS total_revenue,
    SUM(u.items_price)::numeric(14, 2) AS items_price
FROM edktd_etl.united_orders u
JOIN stores st ON u.store = st.name
JOIN shipment_destination sd ON st.distributor = sd.distributor
    AND sd.main_destination = true
GROUP BY u.ny_date, sd.code
ORDER BY 1 DESC, 2
```

**Output columns:** `date`, `destination`, `order_count`, `total_items`, `total_revenue`, `items_price`

**Optional filter:** Add `WHERE u.o_type = 'edikted.com'` to limit to edikted.com orders only (excludes wholesale/other channels).

### 2. Protection — Daily by Destination

Base query for protection/warranty metrics. Pre-aggregated daily by destination.

```sql
SELECT
    v2.ny_date::date AS date,
    sd.code AS destination,
    COUNT(*) AS line_count,
    SUM(v2.price)::numeric(14, 2) AS total_price
FROM edktd_history.protection_view_v2 v2
LEFT JOIN shipment_destination sd
    ON v2.distributor = sd.distributor AND sd.main_destination = true
GROUP BY v2.ny_date::date, sd.code
ORDER BY 1 DESC, 2
```

**Output columns:** `date`, `destination`, `line_count`, `total_price`

### 3. New Orders — Daily Aggregated (with dimensions)

The base query for the Daily KPI dashboard. Pre-aggregated daily by destination, o_type, class, country. Covers 550 days for YoY comparison support.

```sql
SELECT
  u.ny_date::date AS date,
  sd.code AS destination,
  u.o_type,
  u.class,
  u.country,
  COUNT(DISTINCT u.order_name) AS order_count,
  SUM(u.items_quantity)::numeric(14,0) AS total_units,
  SUM(u.total_revenue)::numeric(14,2) AS total_revenue,
  SUM(u.items_price)::numeric(14,2) AS items_price,
  SUM(u.shipping_price)::numeric(14,2) AS shipping_price,
  SUM(COALESCE(u.items_cost_usd, 0))::numeric(14,2) AS items_cost_usd
FROM edktd_etl.united_orders u
JOIN stores st ON u.store = st.name
JOIN shipment_destination sd ON st.distributor = sd.distributor AND sd.main_destination = true
WHERE u.ny_date::date >= CURRENT_DATE - INTERVAL '550 days'
GROUP BY u.ny_date::date, sd.code, u.o_type, u.class, u.country
ORDER BY 1 DESC
```

**Output columns:** `date`, `destination`, `o_type`, `class`, `country`, `order_count`, `total_units`, `total_revenue`, `items_price`, `shipping_price`, `items_cost_usd`

---

## Metric Definitions

| Metric | Source Table | Calculation | Notes |
|--------|------------|-------------|-------|
| **Order Count** | united_orders | `COUNT(*)` | Number of orders |
| **Total Items (Units)** | united_orders | `SUM(items_quantity)` | Total units ordered — use `items_quantity`, NOT count |
| **Total Revenue** | united_orders | `SUM(total_revenue)` | Revenue including shipping/tax |
| **Items Price** | united_orders | `SUM(items_price)` | Product-only revenue (excl. shipping/tax) |
| **Protection Count** | protection_view_v2 | `COUNT(*)` | Number of protection line items |
| **Protection Revenue** | protection_view_v2 | `SUM(price)` | Total protection revenue |
| **BOM%** | united_orders | `1 - SUM(items_cost_usd) / NULLIF(SUM(total_revenue - shipping_price), 0)` | Bill of Materials margin. Higher = more profit |
| **AVG Discount%** | united_orders | `1 - SUM(total_revenue - shipping_price) / NULLIF(SUM(items_full_price), 0)` | Discount rate. `items_full_price` = full price before discount, `total_revenue - shipping_price` = net paid |
| **New Customers** | united_orders | `COUNT(DISTINCT order_name) WHERE first_order = true` | Requires first_order flag or subquery |

### Common Mistakes

- **Total units ≠ COUNT(\*)** — Use `SUM(items_quantity)`. Each order can have multiple items.
- **Revenue ≠ items_price** — `total_revenue` includes shipping/tax; `items_price` is product-only.
- **Don't use `order_date`** — Always use `ny_date` for consistency across all queries.
- **BOM% denominator** — Use `total_revenue - shipping_price` (not just `total_revenue`) to exclude shipping from cost basis.
- **Discount% is approximate** — The formula `(items_price - (total_revenue - shipping_price)) / items_price` assumes difference = discount. May include other adjustments.
- **ny_date is text type** — Always cast with `u.ny_date::date` when using in date comparisons or `WHERE` clauses with intervals.
- **Division by zero** — Always wrap denominators with `NULLIF(..., 0)` to avoid errors.

---

## Dashboard Building Patterns

### Monthly Aggregation via DuckDB Custom SQL

Source queries extract **daily** granularity. For monthly charts, use DuckDB custom SQL with `date_trunc` **in the widget's `config.sql`**:

```sql
SELECT date_trunc('month', date) AS month,
       SUM(order_count) AS order_count,
       SUM(total_items) AS total_items,
       SUM(total_revenue) AS total_revenue
FROM query_5_Daily_Orders_Aggregated
GROUP BY 1
ORDER BY 1
```

This keeps a single `date` column in the source so global filters work across daily AND monthly widgets.

### Global Filter Compatibility

All source queries must alias their date column to `date` so a single dashboard date filter works across all widgets. Similarly, use `destination` as the standard column name for destination filters.

### Widget Layout Convention

- **Row 1 (y=0):** KPI cards — one per metric (w=3, h=2)
- **Row 2 (y=2):** Time-series charts — monthly/daily trends (w=6, h=4)
- **Row 3 (y=6):** Breakdown charts — by destination (w=6, h=4)
- **Row 4 (y=10):** Detail tables (w=12, h=4)

---

## Dashboard Building — Two Options

### Option 1: Canvas Dashboard (via `create-dashboard` skill)

Programmatic dashboards using the widget system. Supports all advanced features:
Color By, Period Comparison (YOY/YTD/MTD), Stacked Bars, Labels, Number Format, Top N, Conditional KPI coloring, Reference Lines, Global Filters, Tabs, drag-to-zoom, PDF export.

Use when: standard BI dashboard with reusable widget patterns.

### Option 2: Agent Report (via `agent-report` skill)

A full React page component for pixel-perfect control. JSX is uploaded via `dataviz_upload_report` and served at `/report/<slug>`.

Use when: polished, designed, custom-layout dashboard where widget grid isn't expressive enough.

---

## DuckDB Table Names (reference)

Use `dataviz_list_tables` to get the current list. Known tables as of this writing:

| Table | Contents |
|-------|----------|
| `query_1_revenue` | Revenue by date: `order_date`, `total_revenue`, `otype` |
| `query_5_Daily_Orders_Aggregated` | Orders aggregated daily: `date`, `destination`, `o_type`, `class`, `country`, `order_count`, `total_units`, `total_revenue`, `items_price`, `items_full_price`, `shipping_price`, `items_cost_usd`, `new_customers` |
| `query_6_Last_Year_Month_Comparison` | Monthly YoY: `start_of_month`, `o_type`, `destination`, `total_revenue`, `total_units`, `num_of_orders`, `new_customers`, + `*_last_year` columns |
| `query_7_New_Orders_AOV` | Orders for AOV: `date`, `destination`, `o_type`, `class`, `country`, `record_count`, `total_revenue` |
| `query_8_Products` | Product-level line items: `ny_date`, `destination`, `o_type`, `product_name`, `product_type`, `product_collection`, `sku`, `color`, `size`, `qty_ordered`, `retail_price`, `full_retail_price`, `gross_revenue`, `unit_cost_usd`, `gross_margin`, `country`, `state`, `city` |
| `query_11_Q_Cohorts_Online` | Quarterly cohort analysis: `cohort_q`, `first_order_o_type`, `customers`, + retention/revenue at d0/d90/d180/d270/d360/d540/d720/d900/d1080 |

---

## Adding New Metrics

When a new query or metric is introduced:

1. Add the reference query to this file under "Reference Queries"
2. Add metric definitions to the "Metric Definitions" table
3. Note any special joins, filters, or calculation gotchas
4. If the query introduces new tables, add them to "Key Tables"
5. Update the DuckDB Table Names section above if new extracts are created
