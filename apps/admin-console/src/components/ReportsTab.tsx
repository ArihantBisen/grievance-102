import { useEffect, useMemo, useState } from "react";
import { bulkCloseTickets, fetchCategoryTree, fetchReportsSummary, fetchTeams } from "../api";
import type { Department, ReportsSummary, Team } from "../types";

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// Renders a small delta line under a stat tile comparing `current` to `previous`.
// `lowerIsBetter` flips which direction counts as "good" (e.g. breach rate, resolution
// time) — ticket volume has no inherently good direction, so it stays neutral.
function Delta({
  current,
  previous,
  lowerIsBetter,
}: {
  current: number;
  previous: number;
  lowerIsBetter?: boolean;
}) {
  if (previous === 0) {
    if (current === 0) return null;
    return <div className="stat-tile-delta">new this period</div>;
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return <div className="stat-tile-delta">flat vs previous period</div>;
  const up = pct > 0;
  const good = lowerIsBetter === undefined ? null : lowerIsBetter ? !up : up;
  const color = good === null ? "var(--sub)" : good ? "var(--color-success)" : "var(--color-danger)";
  return (
    <div className="stat-tile-delta" style={{ color }}>
      {up ? "+" : ""}
      {pct.toFixed(1)}% vs previous period
    </div>
  );
}

export function ReportsTab() {
  const [current, setCurrent] = useState<ReportsSummary | null>(null);
  const [previous, setPrevious] = useState<ReportsSummary | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tree, setTree] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [identityId, setIdentityId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [olderThanHours, setOlderThanHours] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Report filters — independent of the bulk-close filters above.
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compare, setCompare] = useState(false);

  const categories = useMemo(
    () => tree.find((d) => d.id === departmentId)?.categories ?? [],
    [tree, departmentId]
  );
  const subcategories = useMemo(
    () => categories.find((c) => c.id === categoryId)?.subcategories ?? [],
    [categories, categoryId]
  );
  const canCompare = Boolean(dateFrom && dateTo);

  function refresh() {
    setLoading(true);
    fetchReportsSummary({
      categoryId: categoryId || undefined,
      subcategoryId: subcategoryId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      compare: canCompare && compare,
    })
      .then((r) => {
        setCurrent(r.current);
        setPrevious(r.previous);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    fetchTeams().then(setTeams).catch((e) => setError(e.message));
    fetchCategoryTree().then(setTree).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [categoryId, subcategoryId, dateFrom, dateTo, compare]);

  async function runBulkClose() {
    if (!identityId && !teamId && !olderThanHours) {
      setError("Set at least one filter (identity, team, or age) before bulk closing — this closes every open ticket matching the filters.");
      return;
    }
    setBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const result = await bulkCloseTickets({
        identityId: identityId || undefined,
        teamId: teamId || undefined,
        olderThanHours: olderThanHours ? Number(olderThanHours) : undefined,
      });
      setLastResult(`Closed ${result.closedCount} ticket(s).`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk close failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card panel">
        <h2>Bulk close tickets</h2>
        <p className="hint" style={{ color: "var(--sub)", fontSize: 12, marginBottom: 12 }}>
          Closes every currently-open ticket matching the filters below (leave a field blank to not
          filter on it — at least one filter is required). Each ticket still gets its own audit entry,
          same as closing it individually.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Identity ID (optional)"
            value={identityId}
            onChange={(e) => setIdentityId(e.target.value)}
          />
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Older than N hours (optional)"
            type="number"
            min={0}
            value={olderThanHours}
            onChange={(e) => setOlderThanHours(e.target.value)}
            style={{ width: 200 }}
          />
          <button className="btn btn-primary" disabled={busy} onClick={runBulkClose}>
            {busy ? "Closing…" : "Bulk Close"}
          </button>
        </div>
        {lastResult && <p style={{ marginTop: 8, fontSize: 13 }}>{lastResult}</p>}
      </div>

      <div className="card panel">
        <h2>Report filters</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setCategoryId("");
              setSubcategoryId("");
            }}
          >
            <option value="">Department…</option>
            {tree.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={categoryId}
            disabled={!departmentId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setSubcategoryId("");
            }}
          >
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={subcategoryId} disabled={!categoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
            <option value="">Sub-category…</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              opacity: canCompare ? 1 : 0.5,
            }}
            title={canCompare ? "" : "Set both From and To dates to enable comparison"}
          >
            <input
              type="checkbox"
              checked={compare}
              disabled={!canCompare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            Compare to previous period
          </label>
          {(departmentId || categoryId || subcategoryId || dateFrom || dateTo) && (
            <button
              className="btn"
              style={{ padding: "3px 10px", fontSize: 11 }}
              onClick={() => {
                setDepartmentId("");
                setCategoryId("");
                setSubcategoryId("");
                setDateFrom("");
                setDateTo("");
                setCompare(false);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading || !current ? (
        <div className="card panel">
          <div className="empty-state">Loading…</div>
        </div>
      ) : (
        <>
          <div className="card panel">
            <h2>Ticket volume &amp; TAT performance</h2>
            <div className="stat-tile-row">
              <div className="stat-tile">
                <div className="stat-tile-value">{current.totals.all}</div>
                <div className="stat-tile-label">Total tickets</div>
                {previous && <Delta current={current.totals.all} previous={previous.totals.all} />}
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{current.totals.open}</div>
                <div className="stat-tile-label">Currently open</div>
                {previous && <Delta current={current.totals.open} previous={previous.totals.open} />}
              </div>
              <div className={`stat-tile${current.totals.breached > 0 ? " stat-tile-alert" : ""}`}>
                <div className="stat-tile-value">{current.totals.breached}</div>
                <div className="stat-tile-label">Breached (in range)</div>
                {previous && (
                  <Delta current={current.totals.breached} previous={previous.totals.breached} lowerIsBetter />
                )}
              </div>
              <div className={`stat-tile${current.breachRate > 0.1 ? " stat-tile-alert" : ""}`}>
                <div className="stat-tile-value">{(current.breachRate * 100).toFixed(1)}%</div>
                <div className="stat-tile-label">Breach rate</div>
                {previous && (
                  <Delta current={current.breachRate * 100} previous={previous.breachRate * 100} lowerIsBetter />
                )}
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{formatHours(current.avgResolutionHours)}</div>
                <div className="stat-tile-label">Avg. resolution time</div>
                {previous && current.avgResolutionHours !== null && previous.avgResolutionHours !== null && (
                  <Delta current={current.avgResolutionHours} previous={previous.avgResolutionHours} lowerIsBetter />
                )}
              </div>
            </div>
          </div>

          <div className="card panel">
            <h2>Tickets by status</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {current.byStatus.map((s) => (
                  <tr key={s.status}>
                    <td>{s.status.replace(/_/g, " ")}</td>
                    <td>{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card panel">
            <h2>Tickets by team</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Open</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {current.byTeam.map((t) => (
                  <tr key={t.teamId}>
                    <td>{t.teamName}</td>
                    <td>{t.openCount}</td>
                    <td>{t.totalCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card panel">
            <h2>Top categories by volume</h2>
            {current.byCategory.length === 0 ? (
              <div className="empty-state">No tickets match these filters.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {current.byCategory.map((c) => (
                    <tr key={c.categoryId}>
                      <td>{c.categoryName}</td>
                      <td>{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card panel">
            <h2>Resolver workload (open tickets)</h2>
            {current.resolverWorkload.length === 0 ? (
              <div className="empty-state">No resolver has any open tickets matching these filters.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Resolver</th>
                    <th>Open tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {current.resolverWorkload.map((r) => (
                    <tr key={r.resolverId}>
                      <td>{r.resolverName}</td>
                      <td>{r.openCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
