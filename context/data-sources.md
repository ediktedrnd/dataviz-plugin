# Dataviz Data Sources

## Production Data Sources

> Source/query inventory captured 2026-05-17 from the live backend. Run `dataviz_list_sources` for the current list of sources; the catalog drifts as new queries are added.

### Architecture: connections vs. data sources

Dataviz has a 3-tier model that decouples credentials from refresh scope:

- **`connections`** = credentials (host, user, password). Currently one: "Edikted Production" (id=2, postgresql).
- **`data_sources`** = a *logical group of queries* with its own schedule. `ownership_mode='published'` means shared across dashboards; `ownership_mode='embedded'` (with `dashboard_id`) means owned by one dashboard.
- **`dashboard_queries`** = individual SQL statements that materialize into DuckDB tables.

Triggering an extract runs **every query attached to that source**, so a "catch-all" published source (like source 2 below) reruns all its queries on every refresh. To give a dashboard its own independent refresh cadence, create an `embedded` source bound to that dashboard (reusing the same `connection_id`) — see Source 508 below as the reference example.

### Source 2: Sales — daily orders + A/B + UK welcome (published, catch-all)
- **Type**: PostgreSQL (connection 2 — Edikted Production)
- **Schedule**: on-demand (no cron — refreshed by upstream jobs/manual triggers)
- **Typical extract**: ~25–30 min, ~880K rows, 12 DuckDB tables
- **Note**: legacy catch-all. New dashboard-specific queries should live on their own `embedded` source (see source 508 example), not here.
- **Tables produced** (DuckDB table = `query_{id}_{name}`):
  - `query_5_Daily_Orders_Aggregated` — primary sales aggregation (date × destination × class × o_type)
  - `query_6_Last_Year_Month_Comparison` — YoY monthly comparison
  - `query_7_New_Orders_AOV` — new-customer + AOV metrics
  - `query_95_ab_orders_window` — A/B test orders window
  - `query_101_ab_panel_us_new_5k` — A/B panel (US new-customer 5K)
  - `query_108_uk_welcome_cohort` — UK welcome-flow cohorts
  - `query_109_uk_welcome_panel` — UK welcome-flow panel
  - `query_112_uk_welcome_daily` — UK welcome-flow daily
  - `query_113_uk_welcome_kpis` — UK welcome-flow KPIs
  - `query_114_uk_welcome_summary` — UK welcome-flow summary
  - `query_115_uk_welcome_react` — UK welcome reactivation
  - `query_116_uk_welcome_gap` — UK welcome gap analysis

### Source 508: Budget & Forecast — daily (embedded, owned by dashboard 39)
- **Type**: PostgreSQL (connection 2 — same Edikted Production credentials)
- **Schedule**: on-demand
- **Typical extract**: ~1 min, 65K rows, 1 DuckDB table
- **Reference pattern**: dashboard-owned source. Refresh runs only this source's query — does not touch the source-2 catch-all.
- **Tables produced**:
  - `query_198_Budget_Forecast` — daily budget & forecast from `dbt_marts.fact_budget_forecast`. Columns: `date, otype, class, dest, budget, forecast`. Joinable to `query_5_Daily_Orders_Aggregated` on `(date, otype↔o_type, class, dest↔destination)`.

### Source 4: Sales — online cohorts (quarterly)
- **Type**: PostgreSQL (prod RDS, `postgres` DB)
- **Schedule**: every 24h
- **Typical extract**: ~3min
- **Tables produced**:
  - `query_11_Q_Cohorts_Online` — quarterly cohort retention and LTV
  - `query_106_Q_Cohort_Period_Matrix` — quarterly cohort period matrix
  - `query_107_M_Cohort_Period_Matrix` — monthly cohort period matrix

### Other PostgreSQL sources (current)
| ID | Name | Schedule |
|---|---|---|
| 221 | Variants — style_colors | 03:30 daily |
| 222 | Variants — skus by size | 03:00 daily |
| 223 | Replen — virtual_7d | 01:00 daily |
| 264 | Repeats — overview | 02:00 daily |
| 265 | Repeats — by SKU | 01:30 daily |
| 266 | Sales — n7d (normalization) | 02:30 daily |
| 332 | Search — searches_raw | every 24h |
| 410 | Style Dev — versions | 04:00 daily |
| 487 | Sales — order lines (united_order_lines, daily ~37M) | 05:00 daily |
| 488 | Repeats — sc_united_with_groups | 02:30 daily |

### GA4
- **Source 390**: GA4 — edikted.com, schedule=every 24h. See `dataviz://skill/ga4-source/SKILL.md`.

## Key DuckDB Tables

### query_5_Daily_Orders_Aggregated
The primary sales table. Columns:
- `date` (DATE) — order date
- `destination` (VARCHAR) — shipping destination (US/UK). For GEO grouping in analyses, prefer the country→store CASE in `dataviz://context/kpis.md` over this column — `destination` shifted over time and breaks YoY alignment.
- `o_type` (VARCHAR) — order type (edikted.com, TikTok, Retail, B2B, etc.)
- `class` (VARCHAR) — order class. Values: `ONLINE` (edikted.com, TikTok Shop, etc.), `RETAIL` (physical stores), `DROP` (B2B / wholesale / dropship), `OTHER` (test / internal). **Always filter `WHERE class != 'OTHER'`** — OTHER rows distort revenue, AOV, and every aggregation.
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
