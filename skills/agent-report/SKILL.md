---
name: agent-report
description: Creates a standalone React dashboard component ("Agent Report") hosted in the Dataviz platform. Use when the user wants a custom, code-level dashboard with full creative freedom — not a widget-based canvas dashboard. Agent Reports are React components that query DuckDB directly via SQL and are served at /report/<slug>.
argument-hint: <dashboard topic, e.g. "revenue breakdown by channel" or "customer acquisition funnel">
---

# Create Agent Report Dashboard

Build a standalone React dashboard component ("Agent Report") hosted in the Dataviz platform for: **$ARGUMENTS**

Agent Reports are full-freedom React components — any layout, design, animation, or visualization approach. They query DuckDB directly via SQL and are served at `/report/<slug>`.

**All content (titles, descriptions, labels, section headers) MUST be in English.**

If no specific topic or data is mentioned, first discover available data using `dataviz_list_tables`, then propose a dashboard concept before building.

## Step-by-Step Process

### Step 0 — Load business context

Before doing anything, read the `edikted-ba` skill. It contains metric definitions, data model, DuckDB table reference, and common mistakes. Use that knowledge to:
1. Choose the right metrics for the business question (not random columns)
2. Apply correct calculations (e.g. BOM% denominator, Discount% formula)
3. Label things properly ("Items Price (excl. shipping)" not just "Price")
4. Pick relevant dimensions (`o_type` = sales channel, `class` = ONLINE/OTHER, `destination` = shipping region)
5. Avoid documented pitfalls (cast `ny_date`, use correct denominators)

Also apply the `frontend-design` skill for aesthetic direction, typography, color palette, and dashboard best practices.

### Step 1 — Discover available data

```
dataviz_list_tables
dataviz_describe_table { table_name: "<relevant table>" }
dataviz_query { sql: "SELECT * FROM <table> LIMIT 5" }
```

Explore every relevant table — understand columns, data types, row counts, and sample data before designing.

### Step 2 — Design the dashboard

Think like a **senior frontend developer and data analyst**:
- What story does the data tell?
- What KPIs matter most?
- What chart types best communicate each insight?
- What layout and visual hierarchy?
- What interactive features (filters, dark/light mode, drill-downs)?

Commit to a clear aesthetic direction (see `frontend-design` skill) — editorial, luxury, brutalist, retro-futuristic, etc. Each report should have its own personality.

### Step 3 — Write the component JSX

Write the JSX source as a string. The component will be compiled and deployed via `dataviz_upload_report` — no git, no rebuild.

Architecture template:

```jsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useQueryData from '../hooks/useQueryData';
import DataSourceBar from '../components/dashboard-ui/DataSourceBar';

export default function MyDashboard() {
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [searchParams] = useSearchParams();
  const isPdf = searchParams.get('pdf') === 'true';
  const navigate = useNavigate();
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const dateClause = useMemo(() => {
    const p = [];
    if (dateRange.from) p.push(`date >= '${dateRange.from}'`);
    if (dateRange.to) p.push(`date <= '${dateRange.to}'`);
    return p.length ? `WHERE ${p.join(' AND ')}` : '';
  }, [dateRange]);

  const rk = `${JSON.stringify(dateRange)}_${dataRefreshKey}`;

  const { data: kpis, loading } = useQueryData(
    `SELECT SUM(col) as total FROM my_table ${dateClause}`,
    { refreshKey: rk }
  );

  return (
    <div>
      {/* Dashboard content */}
    </div>
  );
}
```

### Step 4 — Deploy via MCP (instant, no rebuild)

Use the `dataviz_upload_report` MCP tool:

```
dataviz_upload_report {
  slug: "my-report-slug",
  title: "My Report Title",
  description: "What this report shows",
  jsx_source: "<the full JSX source as a string>"
}
```

The tool handles chunked upload automatically when the JSX exceeds WAF size limits. To update an existing report, call the same tool with the same slug.

Do NOT use curl / REST — the MCP tool wraps all the edge cases (auth, chunking, errors) that manual shell scripts fail on.

### Step 5 — Verify

Confirm the report loads at `https://dataviz.edikted.tech/report/<slug>`. The report is live within ~2 seconds of upload.

## Available Infrastructure

### Data Querying

- **`useQueryData(sql, { refreshKey, skip })`** — hook that runs SQL against DuckDB
- Returns: `{ data, columns, loading, error, refresh, queryTimeMs }`
- Raw SQL — full DuckDB syntax (DATE_TRUNC, DAYOFWEEK, window functions, CTEs, etc.)

### Shared Components

- **`DataSourceBar`** — **MANDATORY in every report.** Shows which DuckDB tables the report queries, with refresh buttons so users can trigger data syncs. Without it, users have no visibility into data freshness.
- **`DashboardShell`** — optional wrapper with header, date picker, PDF export. Props: `title`, `subtitle`, `dateRange`, `onDateChange`, `slug`

### DataSourceBar — Required Setup

Every agent report MUST include a `DataSourceBar`. Place it below the header/controls, hidden in PDF mode.

```jsx
import DataSourceBar from '../components/dashboard-ui/DataSourceBar';

const [dataRefreshKey, setDataRefreshKey] = useState(0);

// In JSX, after header/controls, before dashboard content:
{!isPdf && (
  <DataSourceBar
    duckdbTables={['query_5_Daily_Orders_Aggregated', 'query_6_Last_Year_Month_Comparison']}
    queries={[
      { name: 'Main KPIs', sql: 'SELECT ... FROM query_5_Daily_Orders_Aggregated ...' },
      { name: 'YoY Data', sql: 'SELECT ... FROM query_6_Last_Year_Month_Comparison ...' },
    ]}
    onRefreshComplete={() => setDataRefreshKey(k => k + 1)}
  />
)}
```

- `duckdbTables`: array of all DuckDB table names the report reads from
- `queries`: array of `{ name, sql }` describing the report's main queries (abbreviated SQL is fine)
- `onRefreshComplete`: callback that bumps the `refreshKey` so all `useQueryData` hooks re-fetch
- Always wrap with `{!isPdf && ...}` to hide in PDF export mode

### Charting (Recharts 2.10)

All Recharts components: `AreaChart`, `BarChart`, `ComposedChart`, `LineChart`, `PieChart`, `RadarChart`, `ScatterChart`, `Treemap`, `FunnelChart`, `RadialBarChart`, plus `ResponsiveContainer`, `Tooltip`, `Legend`, `CartesianGrid`, `Cell`, `ReferenceLine`, `ReferenceArea`, etc.

### Routing

- Reports served at `/report/:slug` via `ReportPage.jsx`
- PDF mode: `?pdf=true` query param — hide interactive elements with `data-pdf-hide`
- Navigation: `useNavigate()` for back button, `useSearchParams()` for PDF detection

### Styling

- Inline styles preferred (all existing reports use inline styles, not CSS modules)
- Google Fonts via dynamic `<link>` injection in `useEffect`
- Tailwind CSS classes available but inline styles preferred for self-contained reports
- `isPdf` flag to disable animations and interactive controls in export mode

## Design Guidelines

Apply ALL guidelines from the `frontend-design` skill. The rules below are **additional** Agent Report-specific requirements on top of `frontend-design`.

### Must-Haves

- Date range filter (from/to inputs)
- `DataSourceBar` for data refresh transparency
- Loading spinners on each card while data fetches
- Responsive layout using CSS Grid
- PDF-friendly mode (`isPdf` — disable animations, hide controls)
- Back navigation button
- Proper number formatting (K/M/B suffixes, currency, percentages)
- Tooltip on every chart

### Nice-to-Haves

- Dark/light theme toggle
- Fade-in animations on cards
- Gradient accents and glassmorphism effects
- Section headers with accent bars
- Background textures, noise overlays, or atmospheric depth effects

### Agent Report Visual Patterns

- KPI cards with sparkline mini-charts and trend indicators (arrows + percentage change)
- Gradient area fills for volume metrics
- Horizontal bar charts for ranked data (top countries, channels)
- Composed charts (bars + lines) for dual-axis metrics
- Progress bars in table cells for share/percentage columns
- Color-coded pills for status/change indicators
- Heatmaps for temporal patterns
- Donut charts with center labels for composition
- Metric pills row for secondary KPIs

## Version History

Reports have automatic version history. Each upload saves the previous version. Users can restore via the clock button in the UI. See also the `upload-report` skill for the low-level tool usage.

## Existing Examples for Reference

When available in the working directory, inspect these files in the Dataviz project for design patterns:

| Slug | File | Description |
|------|------|-------------|
| `edikted-orders` | `frontend/src/dashboards/edikted-orders.jsx` | Light theme, Tableau-10 palette, card-based BI design |
| `period-comparison` | `frontend/src/dashboards/period-comparison.jsx` | Year-over-year comparison with period selectors |
| `business-analytics` | `frontend/src/dashboards/business-analytics.jsx` | Dark/light glass theme, KPI sparklines, heatmap, YoY growth |

These live in the Dataviz source repo — if the analyst doesn't have that repo cloned, they can still build agent reports without them; the examples are illustrative, not required imports.
