# `query_118_skus`

**Domain:** catalog · **Grain:** one row per SKU = `(style_color × size)` · **Refresh:** 24h · **Source:** `public.skus`

SKU master. Bridge from catalog → inventory → sales.

## Columns

| Column | Type | Notes |
|---|---|---|
| `sku` | VARCHAR | PK |
| `size` | VARCHAR | XS/S/M/L/XL/etc. |
| `weight` | DECIMAL | shipping weight (grams) |
| `style_color` | VARCHAR | FK to `query_117_style_colors.style_color` |
| `created_at`, `updated_at` | TIMESTAMP | |

## Sample

### Size distribution per style
```sql
SELECT style_color, COUNT(*) AS sku_count,
       string_agg(size, ',' ORDER BY size) AS sizes
FROM query_118_skus
GROUP BY 1
ORDER BY sku_count DESC LIMIT 20;
```

### Recently added SKUs
```sql
SELECT sku, size, style_color, created_at
FROM query_118_skus
WHERE created_at >= CURRENT_DATE - INTERVAL 14 DAY
ORDER BY created_at DESC;
```

## Joins

- `query_118_skus ↔ query_117_style_colors` on `style_color`
- `query_118_skus ↔ query_123_mart_repeats__wide_sku` on `sku = "SKU"` (note: column is quoted in mart)
- `query_118_skus ↔ query_119_virtual_7d` on `sku`
- `query_118_skus ↔ query_124_n7d` on `sku`

## Gotchas

- **Mart joins use the quoted `"SKU"` column** in `query_123` — DuckDB is case-sensitive when quoted.
- Each SKU belongs to exactly one `style_color`. No many-to-many.
