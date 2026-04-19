---
name: create-dashboard
description: Creates a complete canvas dashboard on the Dataviz platform via MCP tools. Use when the user asks to create a dashboard, build a report, or visualize data. Accepts a topic/description as argument.
argument-hint: <dashboard topic, e.g. "sales by date" or "revenue by country">
---

# Create Dashboard

Create a complete canvas dashboard for: **$ARGUMENTS**

**All content (titles, descriptions, widget names, query names, labels) MUST be in English.**

Always use the `dataviz_*` MCP tools. Never call REST endpoints with curl — auth, chunked uploads, and error handling are already handled.

## Prerequisites

Before designing, load the business knowledge:

- **`edikted-ba`** skill — metric definitions (BOM%, Discount%, Revenue vs Items Price), join chains, DuckDB table reference, common pitfalls
- **`context/kpis.md`** (in this plugin) — KPI formulas and GEO mapping
- **`context/data-sources.md`** (in this plugin) — table list and column schemas
- **`context/conventions.md`** (in this plugin) — widget types, grid system, naming

Use this knowledge to pick the **right metrics** (not random columns), apply **correct calculations** (e.g. BOM% denominator), and **label meaningfully** ("Items Price (excl. shipping)" not just "Price").

## Execution Steps

### Step 1 — Discover available data

```
dataviz_list_tables
```
Inspect specific tables if needed:
```
dataviz_describe_table { table_name: "query_5_Daily_Orders_Aggregated" }
```

Choose tables and columns that best match the requested topic.

### Step 2 — Create the dashboard

```
dataviz_create_dashboard { title: "<English title>", description: "<English description>" }
```
Save the returned dashboard `id`.

### Step 3 — Add queries (when needed)

Only needed when the dashboard pulls from a data source directly (not from existing DuckDB tables).

Use the `dataviz_*` MCP — see the tool's input schema for the query payload. When querying existing DuckDB tables, `source_id` should be `null`.

### Step 4 — Save widgets

```
dataviz_save_dashboard { id: <id>, widgets: [...], globalFilters: {...}, relationships: [], tabs: [], calculatedFields: {}, columnAliases: {} }
```

The tool handles chunked upload automatically if the payload exceeds WAF size limits. Widgets go at the **root level** of the payload (not inside `canvas_layout`).

### Step 5 — Report the result

Print a summary table of widgets and the URL: `https://dataviz.edikted.tech/canvas/<id>`

---

## Widget Reference

### Grid Layout
12-column grid. Properties: `x` (0–11), `y` (0+), `w` (1–12), `h` (1+). Each row ≈ 80px.

Standard layouts:
- **4 KPIs across top** — x: 0/3/6/9, w: 3, y: 0, h: 2
- **2 charts side-by-side** — x: 0 w: 6 | x: 6 w: 6, h: 4
- **1 wide chart + 1 narrow** — x: 0 w: 8 | x: 8 w: 4, h: 4
- **Full-width table** — x: 0 w: 12, h: 5

### KPI Card

```json
{
  "id": "kpi_<metric>",
  "type": "kpi",
  "title": "<English title>",
  "x": 0, "y": 0, "w": 3, "h": 2,
  "config": {
    "table": "<table_name>",
    "sql": "SELECT <aggregate> as value FROM <table>",
    "filters": [], "dimensions": [], "measures": [], "calculatedFields": []
  }
}
```

### Chart (line, bar, pie, composed)

```json
{
  "id": "<type>_<desc>",
  "type": "chart",
  "title": "<English title>",
  "x": 0, "y": 0, "w": 8, "h": 4,
  "config": {
    "table": "<table_name>",
    "sql": "<SQL query>",
    "chartType": "line|bar|pie|composed",
    "filters": [], "dimensions": ["<x-axis column>"], "measures": [], "calculatedFields": []
  }
}
```

### Data Table

```json
{
  "id": "table_<desc>",
  "type": "table",
  "title": "<English title>",
  "x": 0, "y": 0, "w": 12, "h": 5,
  "config": {
    "table": "<table_name>",
    "sql": "<SQL query>",
    "filters": [], "dimensions": [], "measures": [], "calculatedFields": []
  }
}
```

### Global Filters (Slicers)

```json
{
  "globalFilters": {
    "_slicers": ["date", "country"],
    "date": { "from": "2026-01-01", "to": "2026-03-31" },
    "country": []
  }
}
```

For a date slicer to work across all widgets, every query must alias its date column to `date`.

## Advanced Features

Supported widget config options (builder mode + custom SQL both work):

- **Color By** — split measures by a dimension: `colorBy: { column: "destination" }`
- **Period Comparison** — YoY/YTD/MTD: `periodComparison: { enabled: true, dateColumn: "date", comparisonType: "YOY", periods: 3 }`
- **Stacked bars** — `stacked: true`
- **Value labels** — `showLabels: true`
- **Number format** — `numberFormat: "currency" | "percent" | "compact" | "number"`
- **Top N** — `topN: 10`
- **Conditional KPI color** — `conditionalFormat: { type: "auto" }`
- **Reference lines** — `referenceLines: [{ value: 1000, label: "Target" }]`
- **Tabs** — `tabs: ["Overview", "Details"]` on the dashboard root

## Rules

- Always use English for titles, descriptions, widget names, query names
- Always use `config.sql` (custom SQL mode) for reliable data loading — the builder mode has edge cases with aggregation
- Always use `/canvas/:id` URL, never `/dashboard/:id`
- Design a well-rounded dashboard: KPI cards for key metrics, trend charts for time series, breakdown charts for dimensions, and a detail table
- Use `source_id: null` for existing DuckDB tables
- Widget IDs must be unique — use format `w_` + random alphanumeric
- For monthly aggregation: source queries extract **daily**, use DuckDB custom SQL with `date_trunc('month', date)` in the widget — this keeps one date column for global filters to work across daily+monthly widgets
