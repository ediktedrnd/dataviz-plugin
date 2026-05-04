# `query_7_New_Orders_AOV`

**Domain:** sales · **Grain:** day × destination × o_type × class × country · **Refresh:** 24h

Lighter-weight orders view used for AOV widgets. Same shape as `query_5` but no cost/units detail — just orders + revenue.

## Columns

| Column | Type |
|---|---|
| `date` | DATE |
| `destination` | VARCHAR |
| `o_type` | VARCHAR |
| `class` | VARCHAR |
| `country` | VARCHAR |
| `record_count` | INTEGER (= orders) |
| `total_revenue` | DECIMAL |

## Sample

```sql
SELECT date,
       SUM(total_revenue) / NULLIF(SUM(record_count), 0) AS aov
FROM query_7_New_Orders_AOV
WHERE class != 'OTHER'
GROUP BY 1 ORDER BY 1 DESC;
```

## When to use

- AOV-only widgets (smaller table = faster)
- When you don't need units/cost — saves bytes in the widget result

## Don't use when

- You need units, BOM%, gross margin → use `query_5_Daily_Orders_Aggregated`
- You need YoY → use `query_6_Last_Year_Month_Comparison`
