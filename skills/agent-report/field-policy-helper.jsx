// ─────────────────────────────────────────────────────────────────────────
// Data-access policy helper for Agent Reports  —  the client side of the
// "handshake" with server-enforced field/row-level security.
//
// HOW IT FITS TOGETHER
//   1. The report DECLARES its sensitive fields (SECURED_FIELDS) and, in the
//      report's server config.policy, the secured DuckDB columns + a
//      column→field map. (Set config.policy via the seed/PUT /config; see
//      backend/db/seed-products-analysis-policy.sql for the canonical example.)
//   2. The SERVER ENFORCES: GET /api/reports/<slug>/policy returns this user's
//      hiddenFields, and /api/extract/query-duck NULLs the secured source
//      columns for restricted users (shadow views replace them with NULL of the
//      same type). Enforcement is by identity — the browser cannot opt out.
//      Because the columns are NULLed (not dropped), existing SQL keeps working:
//      a restricted user's SUM(gross_revenue) just returns NULL/0, no error.
//   3. The CLIENT REFLECTS: this hook hides the fields in the UI so restricted
//      users see a clean report instead of zeroed-out columns.
//
// FAIL CLOSED: until the policy loads — and if it ever fails to load — every
// declared field is treated as hidden. A network blip can never expose revenue.
//
// Copy this block into the report. Replace SLUG / SECURED_FIELDS.
// ─────────────────────────────────────────────────────────────────────────

function useFieldPolicy(slug, securedFields) {
  // Start hidden (fail closed). Only a successful policy fetch can reveal.
  const [hidden, setHidden] = React.useState(() => new Set(securedFields));
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const tok = (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
    fetch(`/api/reports/${slug}/policy`, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((p) => { if (alive) { setHidden(new Set(p.hiddenFields || [])); setLoaded(true); } })
      .catch(() => { if (alive) { setHidden(new Set(securedFields)); setLoaded(true); } }); // fail closed
    return () => { alive = false; };
  }, [slug]);

  const isHidden = React.useCallback((id) => hidden.has(id), [hidden]);
  return { isHidden, hiddenFields: hidden, policyLoaded: loaded };
}

// Example usage inside the component:
//
//   const SLUG = 'products-analysis';
//   const SECURED_FIELDS = ['revenue', 'pct', 'margin_pct', 'avg_disc'];
//   const { isHidden } = useFieldPolicy(SLUG, SECURED_FIELDS);
//
//   // 1) Don't render a hidden column:
//   {!isHidden('revenue') && <td>{fmt$(row.revenue)}</td>}
//
//   // 2) SQL needs NO changes for security. A restricted user's secured columns
//   //    come back NULL, so SUM(gross_revenue) is NULL/0 — never the real value,
//   //    never an error. Hiding the column in (1) is purely for a clean UI.
//   const sql = `SELECT style_color, SUM(gross_revenue) revenue, SUM(qty_ordered) qty
//                FROM query_332_Products GROUP BY 1`;
//
// Note: no `report_slug` is needed on the query call — the server enforces by
// the caller's identity regardless.
