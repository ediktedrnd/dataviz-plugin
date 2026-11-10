---
description: Manage Data security — which sensitive fields (revenue, cost, payroll…) are hidden and which security groups may see them. Use when an admin asks to hide or show a field, give a group access to one, check what a person can see, or asks whether a column is protected.
---

# Data security

A **rule** is a named list of protected fields plus the security groups that may see them. Everyone else gets blank values in those columns, in every dashboard, report and query. Admins and creators always see everything. Only admins can use these tools.

A field is named at the source, once:

| You write | It protects |
|---|---|
| `*revenue*` | any column whose name contains "revenue" |
| `margin` | a column called exactly "margin" |
| `orders.total_price` | that column of the Postgres table `orders` |
| `public.payroll.*` | every column of a table |

Every column **built from** a protected field is hidden too, whatever it is renamed to (`SUM(total_revenue) AS takings` hides `takings`), and a new data source is covered the moment it loads. An **exception** keeps a column visible: a name (`cost_currency`) or one column of one table (`query_12_orders.total`).

## Always: look, preview, show, confirm, save, verify

1. `dataviz_data_security` — the rules, who sees each, and the group names.
2. `dataviz_data_security_preview` — what the change would hide or show. When changing a rule, send the **complete** rule: it replaces the old one.
3. Show the user the preview in plain words: how many columns, which ones matter, and which groups stop or start seeing something.
4. Only after they agree: `dataviz_data_security_save_rule` (or `_delete_rule`) with `confirmed_by_user: true`.
5. `dataviz_data_security_check` — with no arguments it verifies the whole system; with `user` it shows what one person sees.

## Common requests

- **"Hide margin from everyone except finance"** → new rule `{ name: "Margin", fields: ["*margin*"], groups: ["dataviz_finance"] }`. The preview will also say what other cleared groups lose; read that part to the user.
- **"Let procurement see cost"** → change the Cost rule: same fields and exceptions, add the group.
- **"Column X went blank but it isn't sensitive"** → `dataviz_data_security_hidden({ search: "X" })` shows which field it is built from; add an exception to that rule (`query_N_table.X` for one table, or the bare name everywhere).
- **"Is X protected?"** → `dataviz_data_security_hidden({ search: "X" })`. Not listed means visible.
- **"What can Dana see?"** → `dataviz_data_security_check({ user: "dana@…" })`.

## Things to know

- If the overview says **preview**, the rules are not applied yet; an admin turns them on from Admin → Data security. Saving still works and is safe.
- A filter on a protected field (`WHERE revenue > 0`) does not hide the result; only output columns are hidden.
- A Postgres view or dbt table that renames a protected column is not traced: protect that column as a field of its own.
- Store teams see hidden columns for their own store's rows on the store tables. That is the store data filter, not a rule.
- Deleting a rule or removing a field makes columns visible to everyone who can open the report. Say so before doing it.
