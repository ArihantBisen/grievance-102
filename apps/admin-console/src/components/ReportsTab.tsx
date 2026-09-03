import { useEffect, useState } from "react";
import { bulkCloseTickets, fetchReportsSummary, fetchTeams } from "../api";
import type { ReportsSummary, Team } from "../types";

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function ReportsTab() {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [identityId, setIdentityId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [olderThanHours, setOlderThanHours] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  function refresh() {
    fetchReportsSummary().then(setSummary).catch((e) => setError(e.message));
  }

  useEffect(() => {
    refresh();
    fetchTeams().then(setTeams).catch((e) => setError(e.message));
  }, []);

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

      {!summary ? (
        <div className="card panel">
          <div className="empty-state">Loading…</div>
        </div>
      ) : (
        <>
          <div className="card panel">
            <h2>Ticket volume &amp; TAT performance</h2>
            <div className="stat-tile-row">
              <div className="stat-tile">
                <div className="stat-tile-value">{summary.totals.all}</div>
                <div className="stat-tile-label">Total tickets</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{summary.totals.open}</div>
                <div className="stat-tile-label">Currently open</div>
              </div>
              <div className={`stat-tile${summary.totals.breached > 0 ? " stat-tile-alert" : ""}`}>
                <div className="stat-tile-value">{summary.totals.breached}</div>
                <div className="stat-tile-label">Breached (all-time)</div>
              </div>
              <div className={`stat-tile${summary.breachRate > 0.1 ? " stat-tile-alert" : ""}`}>
                <div className="stat-tile-value">{(summary.breachRate * 100).toFixed(1)}%</div>
                <div className="stat-tile-label">Breach rate</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{formatHours(summary.avgResolutionHours)}</div>
                <div className="stat-tile-label">Avg. resolution time</div>
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
                {summary.byStatus.map((s) => (
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
                {summary.byTeam.map((t) => (
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
            {summary.byCategory.length === 0 ? (
              <div className="empty-state">No tickets yet.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byCategory.map((c) => (
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
            {summary.resolverWorkload.length === 0 ? (
              <div className="empty-state">No resolver has any open tickets right now.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Resolver</th>
                    <th>Open tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.resolverWorkload.map((r) => (
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
