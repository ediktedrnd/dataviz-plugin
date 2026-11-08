# Finance Data Sources

The finance Dataviz reads the **NetSuite P&L**, loaded nightly from NetSuite into the finance Postgres database (schema `netsuite`). Dataviz sources extract it into DuckDB; the DuckDB table names follow the source/query that extracted them (`query_<id>_<name>`), so find the live names with `dataviz_list_sources` / `dataviz_list_tables` and look for the P&L ones.

## Load cadence
- One run a day at **01:00 New York time** — the previous New York day is complete.
- Fiscal year = calendar year. Each run **fully reloads every open fiscal year**, so edits and deletions in NetSuite show up the next day.
- A fiscal year is frozen once FP&A locks it in NetSuite; frozen years are not reloaded. FY2025 is frozen.
- `netsuite.load_runs` logs every run (fiscal year, action `loaded` / `skipped_frozen` / `failed`, row count, debit/credit totals, finished_at) — use it for "how fresh is this?".

## `netsuite.pnl_transactions` — the P&L fact
**Grain:** one row per GL accounting line — key `(transaction_id, transaction_line_id)`.

**What's in it** (same filters as FP&A's reconciled saved search):
- posting lines only, primary accounting book
- P&L account types only: `Income`, `Expense`, `OthIncome`, `OthExpense` (there is no separate COGS account type — cost of sales accounts are `Expense`; split them by account number per FP&A's chart of accounts)
- excludes Currency Revaluation, Bill Payment, Payment and Transfer transactions
- all transaction types otherwise (journals, invoices, bills, bill credits, expense reports, …) — not only journal entries

| Column | Meaning |
|---|---|
| `fiscal_year`, `posting_period_id`, `posting_period`, `period_start` | Accounting period the line posts to — **use these for monthly/yearly P&L**, not `trandate` |
| `transaction_id`, `transaction_line_id`, `tranid` | NetSuite internal id, line id, document number |
| `transaction_type` | e.g. Journal, Invoice, Bill, Bill Credit, Expense Report |
| `trandate` | Transaction date (can differ from the posting period) |
| `subsidiary_id`, `subsidiary`, `subsidiary_path`, `subsidiary_currency` | Subsidiary; `subsidiary_path` is the full parent path |
| `account_id`, `account_number`, `account_name`, `account_type` | GL account |
| `department_id`, `department`, `class_id`, `class`, `location_id`, `location`, `location_path` | Segments |
| `business_objective_id`, `business_objective` | Custom segment "Business Objective" |
| `entity_id`, `entity`, `entity_kind`, `vendor_code` | Counterparty (line entity, else header entity); `entity_kind` = vendor / employee / other |
| `memo`, `transaction_memo` | Line memo, header memo |
| `transaction_currency`, `exchange_rate` | Original transaction currency |
| `debit`, `credit` | Base-currency debit / credit |
| `amount` | Base (subsidiary) currency, **debit − credit** — see `kpis.md` for the sign convention |
| `ns_created_at`, `ns_last_modified_at`, `loaded_at` | NetSuite timestamps, load time |

## `netsuite.pnl_fpa_view` — FP&A report shape
Same rows as `pnl_transactions`, with FP&A's 18 saved-search columns under their exact names (`"Internal ID"`, `"Subsidiary"`, `"Type"`, `"Date"`, `"Period"`, `"Document Number"`, `"ID"`, `"Name"`, `"Account"`, `"Memo"`, `"Amount"`, `"Department"`, `"Class"`, `"Location"`, `"Business Objective"`, …) plus the ids and `fiscal_year`, `period_start`, `account_type`, `amount_gl`.
- `"Amount"` is in **report convention**: income positive, expenses positive. `amount_gl` is the raw GL amount.
- `"Account"` = account number + name. `"ID"` = vendor code (vendors only). `"Name"` = counterparty when it's neither a vendor nor an employee.
- Quote these column names in SQL — they contain spaces and capitals.

## Gotchas
- **Future-dated lines**: ~111 lines post to fiscal years 2027–2036 (date typos in NetSuite, flagged to FP&A). Filter `fiscal_year <= <current year>` on trend charts.
- `entity` is null on ~31% of lines — mostly journals, which carry no counterparty.
- Some `transaction_memo` text is garbled (e.g. April 2025 credit-card journals). That's how it is stored in NetSuite, not an extract bug.
- All subsidiaries with P&L lines are USD-based, so `amount` is USD today. If a non-USD subsidiary appears, don't sum `amount` across subsidiaries without converting.
