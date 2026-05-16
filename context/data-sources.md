# Dataviz Data Sources

> **Last reorg: 2026-05-16.** A single shared **Connection** (id=2 "Edikted Production", prod RDS, user `dataviz`) now backs all PostgreSQL sources. Sources were renamed for clarity; **IDs are preserved** so external callers (Airflow, dashboards) keep working. 195 historical CSV uploads were moved to `purpose='archive'` and are hidden from the default catalog view.
>
> **Also on 2026-05-16:** source `[332]` cleaned up (27 legacy schema-probe queries removed; renamed from "Style Dev — schema discovery (legacy)" to **Search — searches_raw**). New source **`[487]` Sales — order lines** created for `edktd_etl.united_order_lines` (~37M rows, ~50 min daily extract) backing dashboard 8 (Products Analysis 2.0).

## Production Data Sources (PostgreSQL)

| ID | Name | Schedule | Driven by | DuckDB tables |
|---|---|---|---|---|
| **2** | Sales — daily orders + A/B + UK welcome | none (API) | Airflow daily | `query_5_Daily_Orders_Aggregated`, `query_6_Last_Year_Month_Comparison`, `query_7_New_Orders_AOV`, `query_95_ab_orders_window`, `query_101_ab_panel_us_new_5k`, `query_108_uk_welcome_cohort`, `query_109_uk_welcome_panel`, `query_112_uk_welcome_daily`, `query_113_uk_welcome_kpis`, `query_114_uk_welcome_summary`, `query_115_uk_welcome_react`, `query_116_uk_welcome_gap` |
| **4** | Sales — online cohorts (quarterly) | 24h | Airflow + scheduler | `query_11_Q_Cohorts_Online`, `query_106_Q_Cohort_Period_Matrix`, `query_107_M_Cohort_Period_Matrix` |
| **221** | Variants — style_colors | 30 3 * * * | scheduler | `query_221_style_colors` |
| **222** | Variants — skus by size | 0 3 * * * | scheduler | `query_222_skus` |
| **223** | Replen — virtual_7d | 0 1 * * * | scheduler | `query_223_virtual_7d` |
| **264** | Repeats — overview | 0 2 * * * | scheduler | `query_264_mart_repeats__wide_overview` |
| **265** | Repeats — by SKU | 30 1 * * * | scheduler | `query_265_mart_repeats__wide_sku` |
| **266** | Sales — n7d (normalization, sales potential when out-of-stock) | 30 2 * * * | scheduler | `query_266_n7d` |
| **332** | Search — searches_raw | 24h | scheduler | `query_127_searches_raw` |
| **410** | Style Dev — versions | 0 4 * * * | scheduler | `query_175_style_dev_versions`, `query_177_sdv_v2_from_new_source` |
| **487** | Sales — order lines (united_order_lines, daily ~37M) | 0 5 * * * | scheduler | `query_8_Products` |

## Production Data Sources (GA4)

| ID | Name | Schedule | Notes |
|---|---|---|---|
| **390** | GA4 — edikted.com | 24h | Main GA4 source for dashboards 35, 36, 37 |
| **389** | GA4 — Sales by Store (embedded) | none | Embedded source bound to dashboard 27 |

**Cron times are UTC** (NY is UTC−5/−4). Times 1–4am UTC fall outside Airflow's daily window to avoid contention.

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

### `public.style_dev_versions`
Style-development versioning — one row per `(style_dev_id, version)`. Tracks each redevelopment iteration with its techpack, designer, tech-designer, category, and reason. Sits upstream of `style_colors` in the product-creation flow.

DuckDB table: `query_175_style_dev_versions` (source 410, refreshed daily at 04:00 UTC).

| Column | Notes |
|---|---|
| `id` | PK |
| `style_dev_id` | FK → style_developments.id (logical group) |
| `version` | Iteration number (1, 2, 3…) |
| `redeveloped` | Boolean — true if this version was a redevelopment |
| `reason` | Free-text reason for the version (e.g. `Production / QC`) |
| `occasion`, `type`, `category`, `template` | FK lookups (merchandising metadata) |
| `designer`, `tech_designer` | FK → users (creator + technical owner) |
| `techpack` | Google Sheets URL for the techpack |
| `style_name` | Display name |
| `created_at`, `updated_at` | Timestamps |

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
