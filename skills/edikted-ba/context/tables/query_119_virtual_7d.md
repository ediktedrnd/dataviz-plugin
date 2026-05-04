# `query_119_virtual_7d`

**Domain:** replenishment · **Grain:** `(store, style_color, sku, order_date)` · **Refresh:** 24h · **Source:** `edktd_etl.virtual_7d` (populated by Lambda `virtual-7d-process`)

Raw last-7-days sales. Foundation for all short-term retail analytics.

## Columns

| Column | Type | Notes |
|---|---|---|
| `store` | VARCHAR | store code (LAGROVE / MNMOA / etc.) |
| `style_color` | VARCHAR | FK to `query_117_style_colors.style_color` |
| `sku` | VARCHAR | FK to `query_118_skus.sku` |
| `sales_qty` | INTEGER | units sold this date at this store |
| `inventory_quantity` | INTEGER | snapshot at end of day |
| `order_date` | DATE | |

## Sample

### 7d sales per store
```sql
SELECT store, SUM(sales_qty) AS qty_7d
FROM query_119_virtual_7d
GROUP BY 1 ORDER BY qty_7d DESC;
```

### Top movers by style
```sql
SELECT v.style_color, sc.collection,
       SUM(v.sales_qty) AS qty_7d,
       SUM(v.inventory_quantity) / NULLIF(COUNT(DISTINCT v.order_date), 0) AS avg_daily_inv
FROM query_119_virtual_7d v
JOIN query_117_style_colors sc USING (style_color)
GROUP BY 1, 2 ORDER BY qty_7d DESC LIMIT 20;
```

## Gotchas

- **Rolling 7-day window** — extract filters `order_date >= CURRENT_DATE - INTERVAL '7 days'` at extract time. Old days fall out automatically each refresh.
- **Today is partial** — most-recent date isn't a full 24h until the next extract.
- **Multiple rows per `(store, sku)`** — one per day. Aggregate before joining if you need a per-SKU summary.
- **Inventory snapshot** — not transactional. `SUM(inventory_quantity)` across days is wrong. Use AVG or the latest day.
