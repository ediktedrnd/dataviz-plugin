# `query_8_Products`

**Domain:** sales · **Grain:** order line item (one row per ordered SKU on an order) · **Refresh:** scheduled (large, ~37M rows)

Product-level detail. Use for top-SKU/color/collection breakdowns.

## Columns

| Column | Type | Notes |
|---|---|---|
| `ny_date` | DATE | order date NY-tz |
| `destination` | VARCHAR | distributor code |
| `o_type` | VARCHAR | channel |
| `product_name` | VARCHAR | display name |
| `product_type` | VARCHAR | e.g. "Dress", "Top" |
| `product_collection` | VARCHAR | merchandising group |
| `sku` | VARCHAR | join key to `query_118_skus` |
| `color` | VARCHAR | |
| `size` | VARCHAR | |
| `qty_ordered` | INTEGER | units on this line |
| `retail_price` | DECIMAL | post-discount price |
| `full_retail_price` | DECIMAL | RRP (pre-discount) |
| `gross_revenue` | DECIMAL | `qty_ordered × retail_price` |
| `unit_cost_usd` | DECIMAL | COGS per unit |
| `gross_margin` | DECIMAL | per-line margin amount |
| `country`, `state`, `city` | VARCHAR | shipping address |

## Sample

### Top 20 SKUs by units, last 30 days
```sql
SELECT sku, product_name, color, size,
       SUM(qty_ordered) AS units,
       SUM(gross_revenue) AS revenue
FROM query_8_Products
WHERE ny_date >= CURRENT_DATE - INTERVAL 30 DAY
GROUP BY 1, 2, 3, 4
ORDER BY units DESC LIMIT 20;
```

### Collection × destination
```sql
SELECT product_collection, destination,
       SUM(qty_ordered) AS units,
       SUM(gross_revenue) AS revenue,
       SUM(gross_margin) / NULLIF(SUM(gross_revenue), 0) AS margin_pct
FROM query_8_Products
WHERE ny_date >= CURRENT_DATE - INTERVAL 90 DAY
GROUP BY 1, 2 ORDER BY revenue DESC;
```

## Gotchas

- **Date column is `ny_date`** here, not `date` — extracts didn't rename.
- **Big table** — always filter date or product/SKU before aggregating.
- **No class/o_type cleanup filter equivalent** — wholesale lines may be present; if needed, filter `o_type` explicitly.
- **`unit_cost_usd` can be NULL** — use `COALESCE(unit_cost_usd, 0)` if summing.
