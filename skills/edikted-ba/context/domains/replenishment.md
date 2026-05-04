# Domain: Replenishment / Inventory / Repeat

Operational inventory + repeat-buy decisions. "Should we re-order this style/SKU? How many days of cover? Where's the OTW?"

## Tables

| Table | Grain | Drill |
|---|---|---|
| `query_122_mart_repeats__wide_overview` | one row per `(destination, style_color)` | `context/tables/query_122_mart_repeats__wide_overview.md` |
| `query_123_mart_repeats__wide_sku` | one row per `(destination, SKU)` | `context/tables/query_123_mart_repeats__wide_sku.md` |
| `query_119_virtual_7d` | raw daily sales `(store, style_color, sku, order_date)` last 7 days | `context/tables/query_119_virtual_7d.md` |
| `query_124_n7d` | distributor-normalized 7d/30d sales per SKU (WEB only) | `context/tables/query_124_n7d.md` |

## Concepts

- **BOM** — Bill of Materials cost. Lower = more profit margin.
- **BIS** — Back In Stock date target.
- **OTW** — On The Way (in-transit). Split into `Air OTW`, `Sea OTW`, `Sea Draft`, `Sea Balance`.
- **BnO** — Booked And Ordered (allocated to upcoming dates).
- **Inv Days** — days-of-cover at current sales velocity.
- **wr** — write-down/write-off flag (excluded from active replen).

## Decision queries (recipes)

### 1. Reorder candidates — low cover, no OTW
```sql
SELECT "Style Color", "Title", "Inv Days", "Balance + OTW",
       "30D Sales", "Sea OTW", "Air OTW", "Supplier"
FROM query_122_mart_repeats__wide_overview
WHERE "Inv Days" < 14
  AND ("Sea OTW" + "Air OTW") = 0
  AND wr = false
ORDER BY "30D Sales" DESC
LIMIT 50;
```

### 2. Top sellers last 7d
```sql
SELECT sc.style_color, sc.collection, sc.item_type,
       SUM(v.sales_qty) AS qty_7d
FROM query_119_virtual_7d v
JOIN query_117_style_colors sc USING (style_color)
GROUP BY 1, 2, 3
ORDER BY qty_7d DESC LIMIT 20;
```

### 3. SKU-level drill: hot sizes within a color
```sql
SELECT "Style Color", "SKU", "Size",
       "V7D_sales", "30D_sales",
       "Inv total", "Balance + OTW", "Inv Share"
FROM query_123_mart_repeats__wide_sku
WHERE "Style Color" = '<X>'
ORDER BY "V7D_sales" DESC;
```

### 4. Normalized share — does this SKU over-index?
```sql
SELECT distributor, style_color, sku,
       sku_sales_7d, normv7d,    -- share of distributor sales
       sku_sales_30d, normv30d
FROM query_124_n7d
WHERE distributor = 'WEB-US'
ORDER BY normv7d DESC LIMIT 50;
```

## Common Gotchas

- **Mart columns are double-quoted** — case-sensitive + spaces. Always quote: `"Style Color"`, `"Inv Days"`, `"V7D_sales"`.
- **`wr = true`** = SKU/style is being written off. Exclude from replenishment recommendations.
- **`is_garage`** — outlet/clearance flag on the overview table.
- **`virtual7d` (lowercase) vs `V7D_sales`** — virtual7d is a flag on the mart, V7D_sales is the actual qty in the SKU mart.
- **n7d is WEB only** — physical retail not represented. Don't mix with `query_122` totals.
- **virtual_7d has 7-day rolling window** — re-extracts daily; old rows fall out automatically.

## Joins

- `query_122_overview ↔ query_117_style_colors` on `style_color`
- `query_123_sku ↔ query_118_skus` on `SKU` (note: SKU column is `"SKU"` with quotes in the mart)
- `query_123_sku ↔ query_122_overview` on `("destination", "Style Color")` — drill from style to its sizes
- `query_124_n7d ↔ query_118_skus` on `sku`
