# Dataviz Data Sources

## Production Data Sources

### Source 2: Edikted Production (Main)
- **Type**: PostgreSQL
- **Schedule**: Every 24 hours
- **Typical extract**: ~60s, ~94K rows, 3 DuckDB tables
- **Tables produced**:
  - `query_4_Daily_Orders_Aggregated` — Daily aggregation (date, destination, class, o_type)
  - `query_5_Daily_Orders_Aggregated` — Same structure, different query scope
  - `query_6_New_Orders_AOV` — New customer + AOV metrics

### Source 4: Edikted Production (Cohorts)
- **Type**: PostgreSQL
- **Schedule**: Every 24 hours
- **Typical extract**: ~3min, ~33 rows, 1 DuckDB table
- **Tables produced**:
  - `query_11_Q_Cohorts_Online` — Quarterly cohort retention and LTV

## Key DuckDB Tables

### query_5_Daily_Orders_Aggregated
The primary sales table. Columns:
- `date` (DATE) — order date
- `destination` (VARCHAR) — shipping destination (US/UK)
- `o_type` (VARCHAR) — order type (edikted.com, TikTok, Retail, B2B, etc.)
- `class` (VARCHAR) — order class (ONLINE, RETAIL, DROP)
- `country` (VARCHAR) — customer country (full name)
- `order_count` (INTEGER)
- `total_units` (INTEGER)
- `total_revenue` (DECIMAL)
- `items_price` (DECIMAL) — full price before discounts
- `items_full_price` (DECIMAL)
- `shipping_price` (DECIMAL)
- `items_cost_usd` (DECIMAL) — COGS
- `new_customers` (INTEGER)

### query_11_Q_Cohorts_Online
Quarterly cohort analysis. Columns:
- `cohort_q` (VARCHAR) — cohort quarter (e.g. "2025-Q1")
- `first_order_o_type` (VARCHAR)
- `customers` / `customers_d0` / `customers_d90` / `customers_d180` / ... (INTEGER)
- `total_revenue_d0` / `total_revenue_d90` / `total_revenue_d180` / ... (DECIMAL)
- `orders_d0` / `orders_d90` / ... (INTEGER)
- `items_quantity_d0` / `items_quantity_d90` / ... (INTEGER)

Suffixes: `_d0` (day 0), `_d90`, `_d180`, `_d270`, `_d360`, `_d540`, `_d720`, `_d900`, `_d1080`

## Retail / Replenishment Domain (PostgreSQL — Edikted Production)

These tables live in the same PostgreSQL connection as the sales aggregations. They power retail (physical store) inventory + replenishment workflows. Wire them in as `published` data sources via `Sources → Add PostgreSQL` or query them ad-hoc through an extract.

### `public.style_colors`
Catalog parent — one row per **style-color** (a product variant before sizing). The PK that every product, sku, and aggregation hangs off.

| Column | Notes |
|---|---|
| `id` | PK — used as FK target everywhere |
| `style_color` | Display key, e.g. `RED-001` |
| `style` | Style code (without color) |
| `published` | Boolean — true if customer-facing |
| `rrp` | Recommended retail price |
| `status` | Lifecycle (active / archived / etc.) |
| `collection`, `group`, `item_type` | Merchandising hierarchy |
| `product_image` | URL |

### `public.skus`
SKU = `(style_color × size)`. Bridge between catalog and inventory/sales.

| Column | Notes |
|---|---|
| `sku` | PK |
| `size` | e.g. XS/S/M/L |
| `style_color` | FK → `style_colors.id` |
| `weight` | Shipping weight |

### `public.replen_statuses`
Lookup for per-store-style-color replenishment status (`Active`, `Paused`, `Archived`, …). Joined via `store_style_colors.replen_status`.

| Column | Notes |
|---|---|
| `id` | PK |
| `status` | Display label |
| `archive` | Boolean — hide from operational UIs |

### `public.store_skus_replenishment` (view)
The **heart of retail replenishment planning** — one row per `(store, sku)`. Aggregates sales velocity, on-hand and warehouse inventory, OTW, and the recommended replen quantity.

| Column | Notes |
|---|---|
| `store`, `sku` | Composite key |
| `inventory` | On-hand at store |
| `wh_inv` | Warehouse inventory |
| `sales_7d`, `sales_30d`, `virtual_7d` | Sales velocity windows |
| `otw` | On-the-way (in-transit) units |
| `recom_replen` | Recommended replen quantity |
| `inventory_days` | Cover (days of supply) |
| `sales_level` | Tier label |
| `web_7d` | Web-channel sales over the last 7 days |
| `base_replen`, `sales_replen` | Components of the replenishment formula |

### `edktd_history.daily_sales` (filter `o_type LIKE 'RETAIL-%'`)
Daily sales aggregation per `(date, store, sku)`. Maintained by Lambda `daily-sales-process` (DELETE + INSERT per date, idempotent re-runs supported). The `RETAIL-*` filter scopes to physical-store sales (LAGROVE / MNMOA / NYCSOHO / CAIRVINE / CAAMERICANA).

| Column | Notes |
|---|---|
| `order_date` | DATE |
| `store` | Store code |
| `sku` | FK → `skus.sku` |
| `style_color` | FK → `style_colors.id` |
| `o_type` | Order type — filter `LIKE 'RETAIL-%'` for stores |
| `ordered_qty` | Units sold |
| `gross_revenue` | Pre-discount revenue |
| `full_retail_price` | RRP × qty |
| `total_inv` | Inventory snapshot for that day |

**Common joins:**
- `daily_sales JOIN skus USING (sku)` — get size + style_color
- `skus JOIN style_colors ON skus.style_color = style_colors.id` — get RRP, collection
- `store_skus_replenishment JOIN skus USING (sku)` — replen view + sku metadata

## Data Architecture
- **PostgreSQL** (RDS) = source of truth, updated by dbt
- **DuckDB** = analytics engine, loaded from PostgreSQL via extract pipeline
- **Extract flow**: PostgreSQL → JSON → DuckDB (write DB) → Parquet → DuckDB (read DB)
- **Parquet files**: stored on EFS at `/app/data/parquet/`
