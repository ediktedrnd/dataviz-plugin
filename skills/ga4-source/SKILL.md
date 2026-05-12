---
description: Configure, query, refresh, and troubleshoot the GA4 (Google Analytics Data API) source in Dataviz. Use when adding GA4 widgets, when an extract fails, or when rotating the service-account key.
---

# GA4 Source

Dataviz pulls Google Analytics 4 via the **Data API v1beta** `runReport` endpoint. Each GA4 source materializes one or more DuckDB tables (`query_<id>_<name>`), and those tables behave identically to PG-extracted tables — widgets and MCP queries can JOIN them to sales / cohort / replenishment data with ordinary SQL.

## Architecture

```
backend env (GA4_PROPERTY_ID + key file)
        │
        ▼
 data_sources row (type='ga4', config={} → falls through to env)
        │   ┌─ dashboard_queries row (sql_text = JSON spec)
        │   │
        ▼   ▼
  extract/ga4.js → runReport → NDJSON → DuckDB COPY → Parquet → reload READ db
                                                                       │
                                                                       ▼
                                                              query_<id>_<name> table
                                                                       │
                                                                       ▼
                                                       widget SQL / MCP dataviz_query
```

Per-source override is supported (paste different property/key in the UI) but the default flow uses env vars so analysts don't touch credentials.

## Production wiring (already deployed)

**Service account:** `data-looker-studio@looker-studio-project-491405.iam.gserviceaccount.com` (Tal granted Viewer on edikted.com - GA4 property).

**GA4 property:** `254838435` (edikted.com - GA4). UK property `502745106` exists but is not currently mounted.

**Backend env vars** (set in `/opt/Dataviz/.env` on prod EC2):

```
GA4_PROPERTY_ID=254838435
GA4_SERVICE_ACCOUNT_KEY_FILE=/opt/edikted/secrets/ga4-key.json
```

**Key file:** `/opt/edikted/secrets/ga4-key.json` on prod EC2 (root:root, 600). Same `/opt/edikted/secrets` directory is mounted read-only into the backend container alongside the existing Gmail SA key.

**Optional tuning env:**
- `GA4_REQUEST_TIMEOUT_MS` — per-runReport timeout (default 60000).

## Adding a GA4 query (via UI)

1. Open the target dashboard → **Sources** → **+ Add Data Source** → **GA4**.
2. The form shows a purple **Connection ready** badge with property + client email — no key paste.
3. Pick name + use the builder (dim multi-select, metric multi-select, date range preset). For Advanced, switch to **JSON** tab.
4. **Create Source, Add Query & Extract** → backend kicks off `extractSource()` and writes the DuckDB table.
5. Widget SQL can now reference `query_<id>_<name>` and JOIN it to other tables.

## Adding a GA4 query (via MCP — for the BA workflow)

> When the MCP tool `dataviz_create_ga4_query` ships in the plugin repo this section will turn into a one-liner. Until then, the BA can:
>
> 1. Ask Claude in the dataviz remote MCP session what dim/metric exists (`dataviz://skill/ga4-source/dimensions.md` — TBD) or describe the desired output.
> 2. Have Claude POST `/api/sources` (type='ga4', config={}) and `/api/dashboard-canvas/:id/queries` with `sql_text` = JSON spec.
> 3. Trigger `dataviz_extract_source` and poll `dataviz_extract_status`.

## Query spec format

`dashboard_queries.sql_text` holds a JSON string when the parent source is `type='ga4'`:

```json
{
  "dimensions": ["date", "deviceCategory"],
  "metrics":    ["sessions", "totalUsers", "ecommercePurchases"],
  "dateRange":  { "startDate": "30daysAgo", "endDate": "yesterday" },
  "dimensionFilter": null,
  "limit": 100000
}
```

- `dateRange` accepts `NdaysAgo`, `yesterday`, `today`, or `YYYY-MM-DD`.
- `limit` capped at 250000 per request; backend auto-paginates up to 20 pages (~5M rows).
- `dimensionFilter` / `metricFilter` / `orderBys` are pass-through to the Data API (full FilterExpression tree supported even though the UI only ships a simple equality picker).

## Type coercion (output DuckDB schema)

| GA4 column | DuckDB type |
|------------|-------------|
| `date` dimension (`YYYYMMDD`) | DATE |
| `dateHour` / `dateHourMinute` | TIMESTAMP |
| any other dimension | VARCHAR |
| metric with `TYPE_INTEGER` | BIGINT |
| metric with `TYPE_FLOAT` / `TYPE_CURRENCY` / `TYPE_SECONDS` / ... | DOUBLE |

## Refresh

Same as any other source:

- UI: Sources page → row → Refresh button
- MCP: `dataviz_extract_source(source_id)` then poll `dataviz_extract_status`
- Cron: set `schedule` field on the source (defaults presets `5m`, `15m`, `1h`, `6h`, `24h` or raw cron). **Recommendation: daily for GA4** (see Quotas).

## Logging + observability

GA4 extracts use the standard logging pipeline — nothing custom.

**`extract_runs` table** (one row per `POST /api/extract/source/:id`):
- `source_id`, `trigger` (manual / scheduled / mcp), `status` (running / success / error / partial), `tables_count`, `total_rows`, `duration_ms`, `error_message`, `started_at`, `completed_at`, `triggered_by_user_id`.
- API: `GET /api/extract/log?limit=100`.
- UI: there is an extract log page that lists every run with status badge + duration.
- Retention: 30 days (pruned by `runMigrations()` at startup).
- Backend restart marks any leftover `running` rows as `error` with `"Interrupted by server restart"`.

**`query_log` table** (one row per query inside a run):
- `engine='ga4'`, `sql=<JSON spec>`, `status`, `duration_ms`, `row_count`, `error`, `source='extract'`, `extract_run_id`.
- API: `GET /api/extract/log?run_id=<id>` returns the per-query breakdown.
- This is where you see "which GA4 query was slow / failed / returned 0 rows".

**Stdout (docker logs)** — every query logs:
```
[Extract]   Running GA4 query "<name>" (dashboard: <title>)...
[Extract]   ✓ "<name>": <rows> rows in <ms>ms
[Extract]   ↻ Reloaded "query_<id>_<name>" into read DB (<rows> rows, GA4)
```

Production tail:
```bash
ssh ec2-user@34.201.105.1 'cd /opt/Dataviz && sudo docker-compose logs --since 10m backend | grep -E "Extract.*GA4|Extract.*ga4"'
```

## Quotas, limits, and guardrails

| Risk | Limit | Mitigation already in place |
|------|-------|-----------------------------|
| Per-request stall | — | `AbortController` with `GA4_REQUEST_TIMEOUT_MS` (default 60s) — raises a clear error instead of hanging the extract_runs row forever. |
| Single-request row cap | 250,000 rows | Code auto-paginates via `offset`, hard cap 20 pages → effective ceiling ~5M rows per query. Beyond that, add a date partition or pre-aggregate. |
| Daily property quota (Core reports) | ~10,000 tokens/property/day (Google) | Default daily schedule. ~20 queries × hourly cron = 480/day = safe. Sub-hour schedules on GA4 sources are discouraged — surface a warning when the UI sets `5m`/`15m` on a `type='ga4'` source (TODO). |
| Concurrent file collision | — | Target table name includes the query ID, so two queries on the same source never share an NDJSON path. Same source + same query running twice is unlikely (UI button disables during extract) but not bulletproof — track via `extract_runs.status='running'` if needed. |
| Backend restart mid-extract | — | Leftover `running` rows flipped to `error` on boot. Re-run manually after restart. |
| Service-account key revoked / rotated | — | Next extract returns 401 from the Data API. `query_log.error` captures it. Rotate steps below. |
| Property access revoked | — | 403 PERMISSION_DENIED → same logging path. |
| Memory spike on large pulls | ~50-200MB per pull | NDJSON stream writes per row so the rows[] array is the only in-memory cost. Worst case: 5M rows × ~200 bytes ≈ 1GB JS heap — avoid by partitioning. |

## Rotate the key

1. Generate new key in GCP IAM → Service Accounts → `data-looker-studio@...` → Keys → Add Key.
2. SCP to prod: `scp -i ec2-key.pem new-key.json ec2-user@34.201.105.1:/tmp/`
3. `ssh ec2-user@34.201.105.1` then `sudo mv /tmp/new-key.json /opt/edikted/secrets/ga4-key.json && sudo chmod 600 /opt/edikted/secrets/ga4-key.json && sudo chown root:root /opt/edikted/secrets/ga4-key.json`
4. `cd /opt/Dataviz && sudo docker-compose restart backend`
5. Verify: hit `GET /api/sources/ga4/status` → should still report `keyConfigured: true` with the new key's `client_email`.
6. Delete the old key from GCP IAM.

## Add a second GA4 property

Two options:

**A) Replace the env default** — edit `/opt/Dataviz/.env`, change `GA4_PROPERTY_ID`, restart backend. All env-default sources now point at the new property.

**B) Per-source override** — create a GA4 source via the UI with a custom property ID (and optionally a different SA key) pasted into the form. That source's `data_sources.config` carries the override; the env default still applies to every other GA4 source.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `PERMISSION_DENIED` on every property | SA not granted on the GA4 property, or granted on the wrong property | GA4 → Admin → Property Access Management → add `data-looker-studio@...` as Viewer on the target property. Wait 1-2 minutes for propagation. |
| `SERVICE_DISABLED analyticsdata.googleapis.com` | Data API not enabled in GCP project `looker-studio-project-491405` | Console → APIs & Services → enable. |
| `Body cannot be empty when content-type is set to 'application/json'` | Old caller without the empty-body parser fix | Backend has `addContentTypeParser` that accepts empty body since PR #69 — verify backend image is current. |
| Extract row stuck in `running` | Backend OOM / crash during runReport | Backend restart auto-flips to `error`. Manually re-run. If recurring on a specific query, lower the dim count or split by date. |
| `0 rows` in DuckDB but GA4 web UI shows data | Wrong dateRange (e.g. `today` returns nothing until the day closes) or filter too narrow | Inspect the spec; bump `endDate` to `yesterday`. |
| Sub-hour cron blows the daily quota | Schedule too tight | Switch source to `24h` (or `6h` at most for fast-moving cuts). |
| `GA4 runReport timed out after 60000ms` | Google-side stall or oversized response | First retry usually works. If chronic, split the query into smaller date windows. |

## Verifying the connection

```bash
# UI: dashboard → Sources → Add Data Source → GA4 → Test GA4 Connection (no inputs needed)
# CLI:
curl -X GET https://dataviz.edikted.tech/api/sources/ga4/status \
  -H "Authorization: Bearer <token>" -H "User-Agent: Mozilla/5.0"
# → { propertyConfigured: true, keyConfigured: true, propertyId: "254838435", clientEmail: "..." }
```

## Out of scope (tracked separately)

- **Dashboard 35** (User Journeys Deep Dive) needs session-level reconstruction (multi-step paths, sessions-to-purchase, PDP→PDP, cart abandon next-step). The Data API can't deliver that — only BigQuery export can. Separate plan: "GA4 BigQuery source type".
- **AWS Secrets Manager** for the key (currently plaintext at `/opt/edikted/secrets/ga4-key.json`). Acceptable for v1 because the file is root-only and the EC2 host is private.
- **Live dim/metric autocomplete** from GA4 Metadata API (currently a static curated list in `frontend/src/lib/ga4Schema.js`).

## Key files

- Backend extract: `backend/src/extract/ga4.js`
- Dispatcher: `backend/src/extract/pipeline.js:343` (`if (source.type === 'ga4')` branch)
- Routes: `backend/src/routes/sources.js` (`/api/sources/ga4/status`, `/api/sources/ga4/test-connection`)
- Frontend form: `frontend/src/components/dashboard/ManageSourcesModal.jsx`
- Query builder: `frontend/src/components/dashboard/Ga4QueryBuilder.jsx`
- Curated dim/metric list: `frontend/src/lib/ga4Schema.js`
- docker-compose env wiring: `docker-compose.yml` (`GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_KEY_FILE`)
