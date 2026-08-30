import { useEffect, useState } from "react";
import {
  fetchMetrics,
  fetchOrphanedTickets,
  fetchSyncRuns,
  fetchUnknownContacts,
  markUnknownContactReviewed,
  type Metrics,
} from "../api";
import type { OrphanedTicket, SyncRun, UnknownContact } from "../types";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function OpsTab() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [orphaned, setOrphaned] = useState<OrphanedTicket[]>([]);
  const [unknownContacts, setUnknownContacts] = useState<UnknownContact[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetchMetrics().then(setMetrics).catch((e) => setError(e.message));
    fetchOrphanedTickets().then(setOrphaned).catch((e) => setError(e.message));
    fetchUnknownContacts(false).then(setUnknownContacts).catch((e) => setError(e.message));
    fetchSyncRuns().then(setSyncRuns).catch((e) => setError(e.message));
  }

  useEffect(refresh, []);

  async function markReviewed(id: string) {
    try {
      await markUnknownContactReviewed(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card panel">
        <h2>System health (spec A4)</h2>
        {!metrics ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <div className="stat-tile-row">
            <div className="stat-tile">
              <div className="stat-tile-value">{formatUptime(metrics.apiUptimeSeconds)}</div>
              <div className="stat-tile-label">API uptime</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-value">
                {metrics.lastInboundWebhookAt ? new Date(metrics.lastInboundWebhookAt).toLocaleTimeString() : "—"}
              </div>
              <div className="stat-tile-label">Last inbound webhook</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-value">{metrics.outboxQueueDepth}</div>
              <div className="stat-tile-label">Outbox queue depth</div>
            </div>
            <div className={`stat-tile${metrics.failedDispatchCount > 0 ? " stat-tile-alert" : ""}`}>
              <div className="stat-tile-value">{metrics.failedDispatchCount}</div>
              <div className="stat-tile-label">Failed dispatches</div>
            </div>
            <div className={`stat-tile${metrics.breachedTicketCount > 0 ? " stat-tile-alert" : ""}`}>
              <div className="stat-tile-value">{metrics.breachedTicketCount}</div>
              <div className="stat-tile-label">Breached tickets</div>
            </div>
          </div>
        )}
      </div>

      <div className="card panel">
        <h2>Tickets requiring reassignment (ADR-010)</h2>
        <p className="hint" style={{ color: "var(--sub)", fontSize: 12, marginBottom: 12 }}>
          Open tickets whose owner's employment status flipped to Inactive. Reassign or close these
          manually in the Resolver Console — the sync job never auto-closes them.
        </p>
        {orphaned.length === 0 ? (
          <div className="empty-state">Nothing needs reassignment right now.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Former owner</th>
                <th>Category</th>
                <th>Team</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orphaned.map((t) => (
                <tr key={t.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{t.id}</td>
                  <td>{t.identity.name} ({t.identity.externalId})</td>
                  <td>
                    {t.category.name}
                    {t.subcategory ? ` · ${t.subcategory.name}` : ""}
                  </td>
                  <td>{t.team.name}</td>
                  <td>
                    <span className="badge badge-amber">{t.status.replace(/_/g, " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card panel">
        <h2>Unknown contacts (ADR-011)</h2>
        <p className="hint" style={{ color: "var(--sub)", fontSize: 12, marginBottom: 12 }}>
          Messages from phone numbers not in the Identity table, logged by the WhatsApp
          webhook receiver.
        </p>
        {unknownContacts.length === 0 ? (
          <div className="empty-state">No unreviewed unknown contacts.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Phone</th>
                <th>First message</th>
                <th>Attempts</th>
                <th>Last seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unknownContacts.map((c) => (
                <tr key={c.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{c.phoneNumber}</td>
                  <td>{c.messageBody ?? "—"}</td>
                  <td>{c.attemptCount}</td>
                  <td>{new Date(c.lastSeenAt).toLocaleString()}</td>
                  <td>
                    <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => markReviewed(c.id)}>
                      Mark reviewed
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card panel">
        <h2>Workline sync runs</h2>
        <p className="hint" style={{ color: "var(--sub)", fontSize: 12, marginBottom: 12 }}>
          Empty until the Identity Service (D2a) exists — this is a read-only view of whatever it writes.
        </p>
        {syncRuns.length === 0 ? (
          <div className="empty-state">No sync runs recorded yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Fetched</th>
                <th>Upserted</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {syncRuns.map((s) => (
                <tr key={s.id}>
                  <td>{s.runType}</td>
                  <td>{s.status}</td>
                  <td>{s.recordsFetched}</td>
                  <td>{s.recordsUpserted}</td>
                  <td>{new Date(s.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
