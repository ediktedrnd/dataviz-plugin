# `query_6_Last_Year_Month_Comparison`

**Domain:** sales · **Grain:** month × o_type × destination · **Refresh:** 24h

Pre-built monthly YoY pairing. Each row has both this-year and last-year values side-by-side so you don't need a self-join.

## Columns

| Column | Type | Notes |
|---|---|---|
| `start_of_month` | DATE | first day of the month |
| `o_type` | VARCHAR | channel |
| `destination` | VARCHAR | distributor code |
| `total_revenue` | DECIMAL | this year |
| `total_units` | INTEGER | this year |
| `num_of_orders` | INTEGER | this year |
| `new_customers` | INTEGER | this year |
| `total_revenue_last_year` | DECIMAL | same month last year |
| `total_units_last_year` | INTEGER | same month last year |
| `num_of_orders_last_year` | INTEGER | same month last year |
| `new_customers_last_year` | INTEGER | same month last year |

## Use cases

- Monthly YoY KPI cards (delta, %change)
- Month-over-month trend with prior-year overlay

## Sample

### YoY %
```sql
SELECT start_of_month,
       SUM(total_revenue) AS rev,
       SUM(total_revenue_last_year) AS rev_ly,
       (SUM(total_revenue) - SUM(total_revenue_last_year))
         / NULLIF(SUM(total_revenue_last_year), 0) AS yoy_pct
FROM query_6_Last_Year_Month_Comparison
GROUP BY 1 ORDER BY 1;
```

## Gotchas

- **Already paired** — don't lag dates yourself. Use the `*_last_year` columns directly.
- Newest month is partial. Either filter it out or label it "MTD".
- No `class` / `country` here — for that drill, use `query_5_Daily_Orders_Aggregated`.
