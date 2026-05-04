# `query_11_Q_Cohorts_Online`

**Domain:** cohorts · **Grain:** quarterly cohort × first-order channel · **Refresh:** 24h · **Scope:** online only

Pre-computed quarterly cohort retention + revenue. Each row = one cohort × one acquisition channel; columns track cumulative behavior at fixed day windows.

## Columns

| Column | Type | Notes |
|---|---|---|
| `cohort_q` | VARCHAR | cohort quarter (e.g. `2025-Q1`) |
| `first_order_o_type` | VARCHAR | acquisition channel |
| `customers_d0` | INTEGER | cohort size at acquisition |
| `customers_d90` | INTEGER | cumulative — customers who ordered any time in days 0-90 |
| `customers_d180`, `_d270`, `_d360`, `_d540`, `_d720`, `_d900`, `_d1080` | INTEGER | same, deeper windows |
| `total_revenue_d0` … `_d1080` | DECIMAL | cumulative revenue through that window |
| `orders_d0` … `_d1080` | INTEGER | cumulative orders |
| `items_quantity_d0` … `_d1080` | INTEGER | cumulative units |

Suffix means **cumulative since acquisition**, not standalone period.

## Sample

### Retention curve
```sql
SELECT cohort_q,
       SUM(customers_d0)   AS d0,
       SUM(customers_d90)  / NULLIF(SUM(customers_d0), 0) AS ret_d90,
       SUM(customers_d180) / NULLIF(SUM(customers_d0), 0) AS ret_d180,
       SUM(customers_d360) / NULLIF(SUM(customers_d0), 0) AS ret_d360
FROM query_11_Q_Cohorts_Online
GROUP BY 1 ORDER BY 1;
```

### LTV at D360
```sql
SELECT cohort_q,
       SUM(total_revenue_d360) / NULLIF(SUM(customers_d0), 0) AS ltv_360
FROM query_11_Q_Cohorts_Online
GROUP BY 1 ORDER BY 1;
```

## Gotchas

- **Always denominate by `customers_d0`** for LTV/retention — never by current cohort size.
- **Recent cohorts immature** — Q1 cohort can't have D360 if today < acquisition_quarter + 360. Filter or grey out.
- **Online only** — don't add to `query_5` totals. They live in different worlds.
- **Cumulative not standalone** — "D90 retention" includes anyone who ordered between day 0 and day 90, not just in the d31-d90 window.
