# Finance KPI Definitions — NetSuite P&L

## Sign convention (read first)
- `amount` (and `amount_gl` in `pnl_fpa_view`) is the GL amount: **debit − credit**. Income accounts are credits, so their `amount` is **negative**; expense accounts are positive.
- `"Amount"` in `pnl_fpa_view` is **report convention**: `-amount` for `Income` / `OthIncome`, `amount` otherwise — so revenue and expenses both show positive.
- Pick one convention per widget and say which in the title or tooltip. Don't mix `"Amount"` and `amount` in one formula.

## P&L lines (GL convention, from `pnl_transactions`)
| Line | Formula |
|---|---|
| Revenue | `-SUM(amount) FILTER (WHERE account_type = 'Income')` |
| Operating expenses (incl. cost of sales) | `SUM(amount) FILTER (WHERE account_type = 'Expense')` |
| Other income | `-SUM(amount) FILTER (WHERE account_type = 'OthIncome')` |
| Other expense | `SUM(amount) FILTER (WHERE account_type = 'OthExpense')` |
| Net income | `-SUM(amount)` over all rows |
| Expense ratio | `Operating expenses / NULLIF(Revenue, 0)` |

- There is no `COGS` account type in this extract — gross profit and gross margin need FP&A's list of cost-of-sales accounts (by `account_number`). Ask for it; don't guess from account names.
- Group months by `period_start` / `posting_period`, not `trandate`.

## Reconciliation anchors
Use these to sanity-check a query before publishing a dashboard (all posting lines, primary book, P&L accounts):

| Fiscal year | Rows | Total debit | Total credit |
|---|---|---|---|
| 2025 (frozen) | 36,298 | 1,201,571,458.28 | 1,294,198,780.64 |

FY2025 matched FP&A's own NetSuite export to the cent. For the open year, compare against the latest `loaded` row in `netsuite.load_runs`.
