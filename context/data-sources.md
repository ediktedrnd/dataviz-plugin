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

## Data Architecture
- **PostgreSQL** (RDS) = source of truth, updated by dbt
- **DuckDB** = analytics engine, loaded from PostgreSQL via extract pipeline
- **Extract flow**: PostgreSQL → JSON → DuckDB (write DB) → Parquet → DuckDB (read DB)
- **Parquet files**: stored on EFS at `/app/data/parquet/`
