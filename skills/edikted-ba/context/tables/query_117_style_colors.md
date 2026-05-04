# `query_117_style_colors`

**Domain:** catalog · **Grain:** one row per `(style, color)` · **Refresh:** 24h · **Source:** `public.style_colors`

Master catalog. Owned by product team. Every analytics SKU/sales row joins back here for collection / RRP / drop date / status.

## Columns

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | DB PK (rarely used in analytics — joins use `style_color`) |
| `style_color` | VARCHAR | display key, primary join key |
| `style` | VARCHAR | code without color |
| `color` | VARCHAR | |
| `item_type` | VARCHAR | merchandising — Top / Dress / etc. |
| `collection` | VARCHAR | merch grouping |
| `fabric_type`, `fabric` | VARCHAR | material |
| `rrp` | DECIMAL | recommended retail price |
| `published` | BOOLEAN | true = customer-facing |
| `drop_date` | DATE | release date |
| `status` | VARCHAR | active / archived |
| `allow_rep` | BOOLEAN | allow repeat orders |
| `gross_weight`, `dim_weight` | DECIMAL | shipping weights |
| `custom_category` | VARCHAR | custom merch grouping |
| `no_drop` | BOOLEAN | exclude from drop reports |

## Sample

### Active published catalog by collection
```sql
SELECT collection, item_type,
       COUNT(*) AS style_count,
       AVG(rrp) AS avg_rrp
FROM query_117_style_colors
WHERE published = true AND status = 'active'
GROUP BY 1, 2 ORDER BY style_count DESC;
```

### Drop calendar — last 30 days
```sql
SELECT drop_date, COUNT(*) AS new_styles
FROM query_117_style_colors
WHERE drop_date >= CURRENT_DATE - INTERVAL 30 DAY
  AND no_drop = false
GROUP BY 1 ORDER BY 1 DESC;
```

## Joins

- `query_117_style_colors ↔ query_118_skus` on `style_color`
- `query_117_style_colors ↔ query_119_virtual_7d` on `style_color`
- `query_117_style_colors ↔ query_122_mart_repeats__wide_overview` on `style_color = "Style Color"`

## Gotchas

- **Use `style_color` (string) for joins**, not `id` (integer).
- **`status='active'` ≠ `published=true`** — a style can be active in PIM but unpublished.
- **Catalog refresh is 24h** — newly added styles may lag a day.
