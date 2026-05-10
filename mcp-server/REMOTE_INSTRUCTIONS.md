# Dataviz MCP

OAuth handled. Skill docs = MCP resources `dataviz://...`. Workflows = MCP prompts (slash menu).

## Hard rules
- No passwords, tokens, secrets, IPs, or AWS resource names in output.
- Dashboard links: `/canvas/:id` only — never `/dashboard/:id`.
- DuckDB queries: filter `WHERE class != 'OTHER'`; wrap denominators in `NULLIF(.., 0)`.
- Full ruleset (dashboards, data, reports): `resources/read dataviz://context/rules.md`.

## Read SKILL.md BEFORE acting on a matching task
- New JSX dashboard/report → `dataviz://skill/agent-report/SKILL.md`
- Upload/update dynamic report → `dataviz://skill/upload-report/SKILL.md`
- Analytics question / SQL → `dataviz://skill/query-data/SKILL.md`
- Refresh data source → `dataviz://skill/refresh-data/SKILL.md`
- Widget-based canvas dashboard → `dataviz://skill/create-dashboard/SKILL.md`
- Daily report pipeline → `dataviz://skill/daily-report/SKILL.md`
- Visual style direction → `dataviz://skill/frontend-design/SKILL.md`
- Edikted BA routing → prompt `edikted-ba` or `dataviz://skill/edikted-ba/...`

## Reference
- Tables + columns: `dataviz://context/data-sources.md`
- KPI formulas + GEO mapping: `dataviz://context/kpis.md`
- API + widget conventions: `dataviz://context/conventions.md`
- Full inventory: `resources/list` and `prompts/list`