# Finance Data Sources

The finance Dataviz has **one source** today: the NetSuite P&L.

| | |
|---|---|
| Source | id `1` — "NetSuite P&L" (PostgreSQL, read-only login) |
| Query | id `1` — standalone extract query owned by source 1 |
| **DuckDB table** | **`query_1_netsuite_pnl`** — query this one |
| Refresh | daily 08:00 UTC (`0 8 * * *`), after the nightly NetSuite load |

Use `dataviz_list_sources` / `dataviz_list_tables` for live status; new tables follow the `query_<id>_<name>` pattern.

## Where the data comes from
- NetSuite → finance Postgres (schema `netsuite`, table `pnl_transactions`) once a day at **01:00 New York time**, then extracted into DuckDB at 08:00 UTC.
- Fiscal year = calendar year. Each run **fully reloads every open fiscal year**, so edits and deletions in NetSuite show up the next day.
- A year is frozen once FP&A locks it in NetSuite. **FY2025 is frozen; FY2026 is open.** Only FY2025 and FY2026 are loaded.
- The current month is partial — data runs through the last nightly load (`MAX(loaded_at)`).

## `query_1_netsuite_pnl` — the P&L fact
**Grain:** one row per GL accounting line — key `(transaction_id, transaction_line_id)`.

**What's in it** (same filters as FP&A's reconciled NetSuite saved search):
- posting lines only, primary accounting book
- P&L account types only: `Income`, `Expense`, `OthIncome`, `OthExpense` (no separate COGS type — cost of sales accounts are `Expense` under the "Cost Of Revenues" group)
- excludes Currency Revaluation, Bill Payment, Payment and Transfer transactions
- all other transaction types: Journal, Bill, Invoice, Bill Credit, Credit Memo, Expense Report

| Column | Type | Meaning |
|---|---|---|
| `fiscal_year` | SMALLINT | 2025, 2026 |
| `posting_period_id`, `posting_period`, `period_start` | BIGINT, VARCHAR, DATE | Accounting period — **use these for months/years**, not `trandate` |
| `transaction_id`, `transaction_line_id`, `tranid` | BIGINT, BIGINT, VARCHAR | NetSuite internal id, line id, document number |
| `transaction_type` | VARCHAR | Journal, Bill, Invoice, … |
| `trandate` | DATE | Transaction date (can differ from the posting period) |
| `subsidiary_id`, `subsidiary`, `subsidiary_path`, `subsidiary_currency` | | EDIKTED LLC, TL DCZ LTD, EDIKTED UK, Edikted Tech Ltd — all USD |
| `account_id`, `account_number`, `account_name` | | GL account. `account_name` carries the hierarchy `Group : Sub : Leaf` |
| `account` | VARCHAR | `account_number || ' ' || account_name`, e.g. `330021 Cost Of Revenues : Purchase - goods` |
| `account_type` | VARCHAR | `Income`, `Expense`, `OthIncome`, `OthExpense` |
| `department_id`, `department` | | Purchasing, Back-Office & Administration, Logistics, Retail, Marketing, … |
| `class_id`, `class` | | Sales channel: B2C Online, B2C Retail, B2B MarketPlace / DropShip / WholeSale, Franchise, **Intercompany**, Overhead, Inventory Incoming, … |
| `location_id`, `location`, `location_path` | | Location segment |
| `business_objective_id`, `business_objective` | BIGINT, VARCHAR | Custom segment; `'(none)'` when not set (almost all lines) |
| `entity_id`, `entity`, `entity_kind`, `vendor_code` | | Counterparty (line entity, else header entity); `entity_kind` = vendor / employee / other; `entity` often already includes the vendor code |
| `memo`, `transaction_memo` | VARCHAR | Line memo, header memo |
| `transaction_currency`, `exchange_rate` | VARCHAR, DOUBLE | Original transaction currency and rate |
| `debit`, `credit` | DECIMAL | Base-currency debit / credit |
| `amount` | DECIMAL | Base (USD) amount, **GL convention: debit − credit** (income negative) |
| `report_amount` | DECIMAL | **FP&A report convention**: income positive, expenses positive (`-amount` for Income/OthIncome) |
| `ns_created_at`, `ns_last_modified_at`, `loaded_at` | TIMESTAMP | NetSuite timestamps, load time (UTC) |

Top-level account group: `split_part(account_name, ' : ', 1)` — Revenues, Refunds, Deferred Revenue PL, Cost Of Revenues, Payroll***, General and administrative expenses, TRAVEL, Marketing expenses, Selling (Other operating) expenses, Logistics expenses, Depreciation and amortization, Bank & Finance expenses, Income Tax expenses, Other Income, Other Expenses, Withholding Tax – Clearing Account IL, gain/loss accounts.

## Gotchas
- **Intercompany** (`class = 'Intercompany'`) is a large share of revenue and does **not** net to zero against intercompany expense. For company-level results exclude it on both sides (`COALESCE(class, '') <> 'Intercompany'`); for per-subsidiary results keep it (TL DCZ LTD and Edikted Tech revenue is almost all intercompany). Always say which.
- **Partial month**: compare YTD / year-over-year on complete months only.
- `entity` is often null — mostly on journals.
- Part of FY2025 revenue has no `class`.
- Some `transaction_memo` text is garbled (April 2025 credit-card journals) — that's how it is stored in NetSuite.
- Dates come back from queries as ISO timestamps; format months in SQL: `strftime(period_start, '%Y-%m')`.
- DuckDB: `rows` is a reserved word — don't use it as an alias.

## Existing report
`/report/finance-pnl` — "Profit & Loss": KPIs vs prior year, monthly P&L, income statement with account drill-down, expenses by department / account / vendor, transaction search. Reuse its section logic (see `kpis.md`) so numbers match.
