# `query_123_mart_repeats__wide_sku`

**Domain:** replenishment + catalog · **Grain:** one row per `(destination, "SKU")` · **Refresh:** 24h · **Source:** `dbt_marts.mart_repeats__wide_sku`

SKU-level drill-down of the repeat picture: per-size sales windows, inventory share, supplier, production days. Use when the overview table says "this style is hot" and you need to know which sizes to reorder.

## Columns

All quoted column names use mixed case + spaces.

### Identifiers
| Column | Notes |
|---|---|
| `destination` | distributor (lowercase here, unlike `"Destination"` in overview) |
| `"Size"` | XS/S/M/L/etc. |
| `"SKU"` | join key to `query_118_skus.sku` |
| `"Style Color"` | join key to `query_117_style_colors.style_color` |
| `"Image"` | URL |
| `"Supplier"` | |

### Sales windows
| Column | Notes |
|---|---|
| `"30D_sales"`, `"90D_sales"`, `"All_sales"` | base windows |
| `"N30D_sales"`, `n30d` | normalized 30d (see `query_124_n7d`) |
| `n7d` | normalized 7d |
| `"V7D_sales"` | from virtual_7d feed |
| `sku_sales_1d`, `sku_sales_7d`, `sku_sales_30d` | unnormalized SKU windows |
| `sales_source` | which feed populated the row |

### Share-of-style metrics
| Column | Notes |
|---|---|
| `"30D_sales_percent"`, `"90D_sales_percent"`, `"All_sales_percent"`, `"V7D_sales_percent"`, `"N30D_sales_percent"` | this size's share within the parent style_color |
| `"All Sales"`, `"% Sales"` | totals & share |

### Inventory
| Column | Notes |
|---|---|
| `"Inv total"`, `"Balance + OTW"` | per-SKU |
| `"Inv Share"` | this SKU's share of style_color inventory |
| `sc_total_inv`, `sc_balance_and_otw` | parent style_color totals (denormalized) |
| `sku_air_otw` | per-SKU air OTW |

### Other
| Column | Notes |
|---|---|
| `wr` | write-off flag |
| `production_days` | lead time |
| `supplier_comment` | |
| `virtual7d`, `vid7` | flags |
| `required_90d`, `required_120d` | forecast |

## Sample

### Hot sizes within a style
```sql
SELECT "Style Color", "SKU", "Size",
       "V7D_sales", "30D_sales", "Inv total", "Inv Share"
FROM query_123_mart_repeats__wide_sku
WHERE "Style Color" = '<X>' AND wr = false
ORDER BY "V7D_sales" DESC;
```

### Size that's over-indexing on demand vs inventory
```sql
SELECT "Style Color", "SKU", "Size",
       "30D_sales_percent" AS demand_share,
       "Inv Share" AS inv_share,
       "30D_sales_percent" - "Inv Share" AS demand_minus_inv
FROM query_123_mart_repeats__wide_sku
WHERE "30D_sales" > 0
ORDER BY demand_minus_inv DESC LIMIT 50;
```

## Joins

- `query_123 ↔ query_118_skus` on `"SKU" = sku`
- `query_123 ↔ query_117_style_colors` on `"Style Color" = style_color`
- `query_123 ↔ query_122_mart_repeats__wide_overview` on `(destination, "Style Color") = ("Destination", "Style Color")` — note the case difference on `destination`.

## Gotchas

- **`destination` is lowercase here** but `"Destination"` in `query_122_overview`. Be explicit when joining.
- **Sales source varies** — `sales_source` says where the numbers came from (virtual_7d / united_orders / etc.). Don't sum across sources blindly.
- **`Inv Share` and `*_percent`** are pre-computed; don't re-derive — you'll double-count.
- **`wr = true` rows** — exclude from replen recommendations.
