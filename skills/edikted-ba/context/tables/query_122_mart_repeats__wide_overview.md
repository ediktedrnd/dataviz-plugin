# `query_122_mart_repeats__wide_overview`

**Domain:** replenishment · **Grain:** one row per `(destination, "Style Color")` · **Refresh:** 24h · **Source:** `dbt_marts.mart_repeats__wide_overview`

Repeat-buy decision snapshot at the **style_color** level. Sales velocity, inventory, days-of-cover, OTW per distributor, supplier — everything needed to answer "should we re-order?"

## Columns (selected — full list ~60)

All column names are **mixed case with spaces**. Always quote.

### Identifiers
| Column | Notes |
|---|---|
| `"Destination"` | distributor (US / UK / etc.) |
| `"Style Color"` | join key to `query_117_style_colors.style_color` |
| `"Title"` | display name |
| `"Image"` | URL |
| `"Status"`, `"Shopify Status"` | lifecycle |
| `"Published"`, `"Allow Repeats"` | gating flags |
| `"Item Type"`, `"Collection"`, `"Supplier"` | merch / sourcing |

### Pricing
| Column | Notes |
|---|---|
| `"Full price"`, `"Disc Price"`, `"%"` | RRP / discounted / discount % |
| `last_discount_date`, `last_discount_percent` | most recent markdown |
| `avg_discount_7d` / `_1m` / `_3m` / `_6m` / `_12m` | rolling avg discount |
| `"BOM"`, `"Mult"` | BOM cost, markup multiplier |

### Sales velocity
| Column | Notes |
|---|---|
| `"1D Sales"`, `"7D Sales"`, `"30D Sales"`, `"All Sales"` | windowed totals |
| `"ED%"`, `"ED_30%"`, `"ED_ALL%"` | edikted-only share |
| `n7d`, `n30d` | normalized share (see `query_124_n7d`) |
| `virtual7d` | flag — present in virtual_7d feed |
| `"Last Order"`, `"Days Published"` | recency |

### Inventory + OTW
| Column | Notes |
|---|---|
| `"total inv"`, `"Inv total"` | on-hand + warehouse |
| `"Inv Days"` | days-of-cover at current velocity |
| `"Repeat Orders"`, `"Inv7 + Rep Days + PFC"`, `"inv 30 + rep"` | replen recipes |
| `"Balance + OTW"` | inventory + in-transit |
| `"Air BnO"`, `"Air OTW"`, `"Air Balance"` | air freight pipeline |
| `"Sea BnO"`, `"Sea OTW"`, `"Sea Balance"`, `"Sea Draft"` | sea freight pipeline |
| `"Missing Sizes"`, `"Inv vs Sales"` | derived diagnostics |
| `"BIS Date"` | back-in-stock target |

### Other
| Column | Notes |
|---|---|
| `is_garage` | outlet / clearance flag |
| `wr` | write-off flag — exclude from active replen |
| `required_90d`, `required_120d` | forecast |
| `other_otw`, `other_active`, `other_required_90d` | other-distributor view |
| `sku_records`, `color_num` | supplemental counts |
| `"Web %"` | web channel share |

## Sample

### Reorder candidates
```sql
SELECT "Style Color", "Title", "Inv Days", "30D Sales",
       "Balance + OTW", "Sea OTW", "Air OTW", "Supplier", "BIS Date"
FROM query_122_mart_repeats__wide_overview
WHERE "Inv Days" < 14
  AND ("Sea OTW" + "Air OTW") = 0
  AND wr = false
  AND is_garage = false
ORDER BY "30D Sales" DESC LIMIT 50;
```

### Discount pressure check
```sql
SELECT "Collection",
       AVG("%") AS avg_discount_now,
       AVG(avg_discount_3m) AS avg_discount_3m
FROM query_122_mart_repeats__wide_overview
WHERE "Published" = true
GROUP BY 1 ORDER BY avg_discount_now DESC;
```

## Gotchas

- **Quote every column** — most names have spaces or mixed case.
- **`wr = true`** = written off. Filter out for active replen.
- **`virtual7d` (lowercase)** is a flag here; **`V7D_sales`** lives only in `query_123` (SKU-level mart).
- **One row per destination × style_color** — joining without `Destination` filter doubles rows.
- **`Inv Days = 0`** can mean either out-of-stock OR no recent sales (division-by-zero handling). Check `total inv` separately.
