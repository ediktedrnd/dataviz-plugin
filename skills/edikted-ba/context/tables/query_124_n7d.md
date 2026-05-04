# `query_124_n7d`

**Domain:** replenishment · **Grain:** one row per `(distributor, style_color, sku)` · **Refresh:** 24h · **Source:** `edktd_etl.norm_7d_mv` · **Scope:** WEB only

7d and 30d sales **normalized to total distributor sales**. Answers "is this SKU over- or under-indexing on demand vs the rest of the catalog at the same distributor?"

## Columns

| Column | Type | Notes |
|---|---|---|
| `distributor` | VARCHAR | (e.g. `WEB-US`, `WEB-UK`) |
| `style_color` | VARCHAR | parent |
| `sku` | VARCHAR | |
| `sku_sales_7d` | INTEGER | raw 7d units |
| `total_sold_v7d_dates` | INTEGER | denominator — distributor total over those same dates |
| `records_7d_num` | INTEGER | row count contributing |
| `total_sold_last_7d` | INTEGER | distributor total (window-aligned) |
| `normv7d` | DECIMAL | `sku_sales_7d / total_sold_last_7d` — share of distributor sales |
| `sku_sales_30d` | INTEGER | raw 30d units |
| `total_sold_v30d_dates`, `records_30d_num`, `total_sold_last_30d` | INTEGER | 30d denominators |
| `normv30d` | DECIMAL | `sku_sales_30d / total_sold_last_30d` |

## Sample

### Top SKUs by share-of-distributor (7d)
```sql
SELECT distributor, style_color, sku, sku_sales_7d, normv7d
FROM query_124_n7d
WHERE distributor = 'WEB-US'
ORDER BY normv7d DESC LIMIT 50;
```

### SKUs that lost share 7d vs 30d
```sql
SELECT distributor, style_color, sku, normv7d, normv30d,
       normv7d - normv30d AS share_change
FROM query_124_n7d
WHERE distributor = 'WEB-US'
  AND sku_sales_30d > 5
ORDER BY share_change ASC LIMIT 50;
```

## Joins

- `query_124_n7d ↔ query_118_skus` on `sku`
- `query_124_n7d ↔ query_117_style_colors` on `style_color`
- `query_124_n7d ↔ query_123_mart_repeats__wide_sku` — possible but check `distributor` casing & filter `query_123` to web destinations.

## Gotchas

- **WEB only** — physical retail not represented. Don't combine with `query_122` totals (which include retail).
- **`normv7d` is a share, not a percent** — multiply by 100 if you want %.
- **`distributor` ≠ `destination`** — different naming conventions. `WEB-US` vs `US`.
- **Long tail of zero-sales SKUs** — filter `sku_sales_7d > 0` before sorting on `normv7d` to avoid noise.
