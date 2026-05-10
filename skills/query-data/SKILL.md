---
description: Query DuckDB tables with SQL. Use when the user asks a data question, wants to explore tables, or needs analytics numbers.
---

# Query Data

Execute SQL queries against the DuckDB analytics database and present results.

## Steps

1. **Understand the question** — What does the user want to know? Reference `context/kpis.md` for standard metric definitions. For "what data/sources/tables do we have?" → read `dataviz://context/data-sources.md` (curated catalog) BEFORE calling `dataviz_list_sources` (live API only adds extract status).

2. **Find the right table** — Use `dataviz_list_tables` and `dataviz_describe_table` to find relevant columns. For Edikted-specific table semantics, prefer `dataviz://skill/edikted-ba/context/tables/<name>.md`.

3. **Write and run SQL** — Use `dataviz_query` to execute. DuckDB supports standard SQL with:
   - `DATE_TRUNC('month', date)` for date grouping
   - `CASE WHEN` for conditional logic
   - Window functions (`ROW_NUMBER`, `LAG`, etc.)
   - `NULLIF` to avoid division by zero

4. **Present results** — Format as a readable table or summary. Include totals and comparisons when relevant.

## GEO Mapping

When grouping by store/geo, use the country-to-store CASE:
```sql
CASE WHEN country::varchar IN ('US','CA','AR','BM','BR','CL','CR','EC','GP','GT','HK','MX','PA','PE','TT','SG',
  'United States','Canada','Argentina','Bermuda','Brazil','Chile','Costa Rica','Ecuador',
  'Guadeloupe','Guatemala','Hong Kong','Mexico','Panama','Peru','Trinidad and Tobago','Singapore')
THEN 'US' ELSE 'UK' END AS geo
```

## Common Tables

- `query_5_Daily_Orders_Aggregated` — Daily sales by date, destination, class, o_type (orders, revenue, units, costs, new_customers)
- `query_11_Q_Cohorts_Online` — Quarterly cohort retention/LTV data

## Arguments

$ARGUMENTS is either:
- A natural language question: "What was total revenue last month?"
- A raw SQL query: "SELECT date, SUM(total_revenue) FROM query_5_Daily_Orders_Aggregated GROUP BY date"
