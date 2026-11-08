# Finance KPI Definitions — NetSuite P&L

All queries run on `query_1_netsuite_pnl` (see `data-sources.md`).

## Sign convention (read first)
- `amount` is the GL amount: **debit − credit**. Income is a credit, so income `amount` is **negative**; expenses are positive.
- `report_amount` is **report convention**: `-amount` for `Income` / `OthIncome`, `amount` otherwise — revenue and expenses both positive.
- Pick one convention per widget and say which. Don't mix them in one formula.

## P&L sections
```sql
CASE
  WHEN account_type = 'Income' THEN 'rev'                                     -- revenues, refunds, deferred revenue
  WHEN account_type = 'Expense' AND split_part(account_name, ' : ', 1) = 'Cost Of Revenues' THEN 'cor'
  WHEN account_type = 'Expense' AND split_part(account_name, ' : ', 1)
       IN ('Bank & Finance expenses', 'Income Tax expenses') THEN 'below'
  WHEN account_type = 'Expense' THEN 'opex'
  ELSE 'below' END                                                            -- OthIncome / OthExpense
```

| Line | Formula |
|---|---|
| Net revenue | `-SUM(amount)` where section = `rev` (after refunds and deferrals) |
| Cost of revenues | `SUM(amount)` where section = `cor` |
| Gross profit | Net revenue − Cost of revenues |
| Operating expenses | `SUM(amount)` where section = `opex` |
| Operating income | Gross profit − Operating expenses |
| Other expense / (income), finance & tax | `SUM(amount)` where section = `below` |
| **Net income** | `-SUM(amount)` over all rows (= operating income − below the line) |
| Margins | line / `NULLIF(net revenue, 0)` |

**Preliminary**: the gross-profit split ("Cost Of Revenues" group) and intercompany handling are still to be confirmed with FP&A. Label them as such.

## Periods
- Group by `period_start` / `posting_period`, never `trandate`.
- YTD and year-over-year: complete months only. Last complete month = max month of the year, minus 1 if that month is the month of `MAX(loaded_at)`.
- Prior-year comparison = the same months of `fiscal_year - 1`.

## Reconciliation
FY2025 is frozen, so its totals (line count, Σ debit, Σ credit, Σ `report_amount`, all lines, intercompany included) never change — compare a new query against them before publishing. The reference totals are kept privately, not in this repo: ask Asaf (finance Dataviz admin) or use the private `finance-dataviz` handbook. For the open year, net income must equal `-SUM(amount)` for the same filters.
