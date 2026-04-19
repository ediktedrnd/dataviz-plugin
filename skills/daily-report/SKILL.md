---
description: Run nightly data refresh + PDF export + email pipeline. Use for scheduled reporting or manual "refresh and send" requests.
---

# Daily Report Pipeline

Execute the full nightly pipeline: refresh data sources, then generate and email PDF reports.

## Pipeline

### Job 1: Data Extract
1. Use `dataviz_extract_source` for source 2 (Edikted Production, ~60s)
2. Poll with `dataviz_extract_status` until complete
3. Use `dataviz_extract_source` for source 4 (Cohorts, ~3min)
4. Poll until complete
5. If any fails — log error but continue

### Job 2: PDF + Email (after Job 1)
1. For each configured dashboard/recipient pair:
   - Use `dataviz_send_report` with dashboard_id and email addresses
2. Log success/failure for each

## Default Configuration

```json
{
  "reports": [
    { "dashboardId": 7, "to": ["assaf@edikted.com", "zvika@edikted.com"] },
    { "dashboardId": 11, "to": ["assaf@edikted.com"] }
  ]
}
```

## Arguments

$ARGUMENTS can be:
- Empty — run full pipeline with default config
- `refresh-only` — only refresh data, skip PDF/email
- `email-only` — skip refresh, just send PDFs
- Custom JSON config with specific dashboards and recipients
