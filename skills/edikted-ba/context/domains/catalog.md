# Domain: Catalog / Style / SKU

Master product taxonomy. "What is this style? What sizes exist? When did it drop? What's the supplier?"

## Tables

| Table | Grain | Drill |
|---|---|---|
| `query_117_style_colors` | one row per `(style, color)` | `context/tables/query_117_style_colors.md` |
| `query_118_skus` | one row per SKU = `(style_color × size)` | `context/tables/query_118_skus.md` |
| `query_123_mart_repeats__wide_sku` | per-SKU sales+inventory snapshot (also covered in replenishment) | `context/tables/query_123_mart_repeats__wide_sku.md` |

## Hierarchy

```
style          (e.g. "DRESS-001")
  ↓
style_color    (e.g. "DRESS-001-BLACK")  ← query_117_style_colors
  ↓
sku            (e.g. "DRESS-001-BLACK-S")  ← query_118_skus
```

Every SKU belongs to exactly one style_color. Every style_color belongs to exactly one style.

## Common queries

### 1. Active published catalog
```sql
SELECT style_color, style, color, item_type, collection, rrp, drop_date
FROM query_117_style_colors
WHERE published = true AND status = 'active'
ORDER BY drop_date DESC;
```

### 2. Style → SKU expansion
```sql
SELECT sc.style_color, sc.collection, sc.rrp,
       s.sku, s.size, s.weight
FROM query_117_style_colors sc
JOIN query_118_skus s USING (style_color)
WHERE sc.style_color = '<X>';
```

### 3. Catalog × sales (last 7d)
```sql
SELECT sc.collection, sc.item_type,
       COUNT(DISTINCT sc.style_color) AS style_count,
       SUM(v.sales_qty) AS qty_7d
FROM query_117_style_colors sc
LEFT JOIN query_119_virtual_7d v USING (style_color)
WHERE sc.published = true
GROUP BY 1, 2
ORDER BY qty_7d DESC NULLS LAST;
```

## Important columns

### `query_117_style_colors`
- `style_color` — display key (e.g. "RED-001"), used as join key everywhere
- `style` — code without color
- `published` — boolean, customer-facing
- `status` — lifecycle (active/archived)
- `rrp` — recommended retail price
- `drop_date` — release date
- `collection`, `item_type`, `fabric_type`, `fabric` — merchandising hierarchy
- `allow_rep` — allow repeat orders (not allow_replen)
- `no_drop` — flag to exclude from drop reports
- `custom_category` — custom merch grouping

### `query_118_skus`
- `sku` (PK)
- `size` (XS/S/M/L/XL)
- `weight` — shipping weight grams
- `style_color` — FK to style_colors
- `created_at`, `updated_at`

## Gotchas

- **`style_color` is a string identifier**, not the integer `id`. Joins use the string.
- Catalog refreshes 24h — newly added SKUs may not be in the latest extract until next refresh.
- `status='active'` ≠ `published=true`. A style can be active in PIM but not yet published.
