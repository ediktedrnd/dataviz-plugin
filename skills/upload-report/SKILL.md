---
description: Upload or update a dynamic JSX report to Dataviz. Use when building or modifying code-based dashboards/reports.
---

# Upload Report

Deploy a dynamic React/JSX report to the Dataviz platform.

## Steps

1. **Write the JSX** — Create a React component that uses:
   - `useQueryData` hook for DuckDB queries
   - `DataSourceBar` for data source display
   - Recharts for charts (`BarChart`, `LineChart`, `ComposedChart`, etc.)
   - Standard React hooks (`useState`, `useMemo`, `useEffect`)

2. **Upload** — Use `dataviz_upload_report` with slug, title, and JSX source.
   The server compiles JSX → JS and stores it.

3. **Verify** — The report is live at `https://dataviz.edikted.tech/report/{slug}`

## Available Imports (from window.__DATAVIZ)

```js
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Bar, BarChart, Line, ComposedChart, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useQueryData from '../hooks/useQueryData';
import DataSourceBar from '../components/dashboard-ui/DataSourceBar';
```

## useQueryData Pattern

```js
const { data, loading, error } = useQueryData(
  `SELECT date, SUM(total_revenue) as revenue FROM query_5_Daily_Orders_Aggregated GROUP BY date ORDER BY date`,
  { refreshKey: 'some-key', skip: false }
);
```

## Version History

Reports have automatic version history. Each upload saves the previous version. Users can restore via the clock button in the UI or via API:
- `GET /api/reports/{slug}/versions`
- `POST /api/reports/{slug}/versions/{id}/restore`

> **Dynamic-only.** This applies to reports uploaded via `dataviz_upload_report`. A handful of legacy reports (`edikted-orders`, `period-comparison`, `business-analytics`) are **static** — bundled into the frontend at `frontend/src/dashboards/*.jsx` and registered in `frontend/src/dashboards/index.js`. Static reports have no version history, no owner field, and no in-UI history button. Always upload new reports as dynamic.

## Mobile views

If the report needs a separate phone layout, ship a `MobileX` component alongside the desktop one and use a top-level dispatcher to switch on `window.innerWidth < 768` or mobile UA. PDF export must always render the desktop layout. See the `agent-report` skill (Mobile View section) for the full pattern — `daily-sales` is the reference implementation.

## Arguments

$ARGUMENTS contains the report slug and optionally description of changes.
