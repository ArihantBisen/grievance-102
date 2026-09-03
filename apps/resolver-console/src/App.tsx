import { useEffect, useMemo, useState } from "react";
import {
  bulkCloseTickets,
  escalate,
  fetchQueue,
  fetchSummary,
  fetchTeams,
  fetchTicket,
  patchTicket,
  reopenTicket,
  reply,
} from "./api";
import { LoginScreen } from "./components/LoginScreen";
import { Queue } from "./components/Queue";
import { QueueDashboard } from "./components/QueueDashboard";
import { TicketDetail } from "./components/TicketDetail";
import { clearSession, loadSession, saveSession, type Session } from "./auth";
import type {
  QueueBucket,
  QueueSummary,
  Team,
  TicketDetail as TicketDetailType,
  TicketListItem,
} from "./types";

// Which raw statuses each dashboard bucket covers. Kept in step with the API's own
// grouping in GET /api/tickets/summary — the tiles' counts come from there, while the
// list below them is filtered here, so the two have to agree on what "in progress" means.
const BUCKET_STATUSES: Record<QueueBucket, string[]> = {
  new: ["NEW"],
  inProgress: [
    "ASSIGNED",
    "IN_PROGRESS",
    "AWAITING_CUSTOMER",
    "NEEDS_RESOLVER_INPUT",
    "ESCALATED",
    "REASSIGNED",
  ],
  closed: ["RESOLVED", "CLOSED"],
  reopened: ["REOPENED"],
};

// JWT auth (Part E step 8, built fresh this pass — no CRM monorepo was reachable to
// reuse from). RLS on the API side means a non-admin session only ever sees their own
// team's tickets regardless of what's requested here — the team picker below exists
// only for admins, who bypass that scoping.
export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilter, setTeamFilter] = useState(""); // admin-only: view a specific team's queue

  const [statusFilter, setStatusFilter] = useState("");
  const [bucket, setBucket] = useState<QueueBucket | "">("");
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketDetailType | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    fetchTeams().then(setTeams).catch((e) => setError(e.message));
  }, [session]);

  function refreshQueue() {
    if (!session) return;
    setQueueLoading(true);
    // Non-admins: RLS restricts results to their own team regardless of teamFilter, so
    // omit it entirely rather than imply they can choose. Admins: teamFilter narrows.
    const scopeTeamId = session.resolver.isAdmin ? teamFilter || undefined : undefined;
    fetchQueue(scopeTeamId, statusFilter || undefined)
      .then(setTickets)
      .catch((e) => setError(e.message))
      .finally(() => setQueueLoading(false));
    fetchSummary().then(setSummary).catch((e) => setError(e.message));
  }

  useEffect(refreshQueue, [session, teamFilter, statusFilter]);

  // The dashboard tiles filter the already-fetched list rather than refetching: the
  // buckets span several statuses each, and the queue endpoint takes a single status.
  const visibleTickets = useMemo(
    () => (bucket ? tickets.filter((t) => BUCKET_STATUSES[bucket].includes(t.status)) : tickets),
    [tickets, bucket]
  );

  async function handleBulkClose(reason: string) {
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await bulkCloseTickets(checkedIds, reason);
      setNotice(
        `Closed ${result.closedCount} ticket${result.closedCount === 1 ? "" : "s"}` +
          (result.skippedCount > 0
            ? ` — ${result.skippedCount} skipped (already closed, or not on your team).`
            : ". The resolution was sent to each requester.")
      );
      setCheckedIds([]);
      refreshQueue();
      if (selectedId) refreshTicket(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk close failed");
    } finally {
      setBulkBusy(false);
    }
  }

  function refreshTicket(id: string) {
    fetchTicket(id).then(setTicket).catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (selectedId) refreshTicket(selectedId);
    else setTicket(null);
  }, [selectedId]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (selectedId) refreshTicket(selectedId);
      refreshQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setTickets([]);
    setTicket(null);
    setSelectedId(null);
    setCheckedIds([]);
    setSummary(null);
  }

  if (!session) {
    return (
      <LoginScreen
        onLoggedIn={(s) => {
          saveSession(s);
          setSession(s);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>Resolver Console</h1>
        <div className="session-picker">
          <span style={{ fontSize: 13 }}>
            {session.resolver.name}
            {session.resolver.isAdmin && <span className="badge badge-purple" style={{ marginLeft: 6 }}>Admin</span>}
          </span>
          {session.resolver.isAdmin && (
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="success-banner">{notice}</div>}

      <QueueDashboard summary={summary} active={bucket} onSelect={setBucket} />

      <div className="layout">
        <Queue
          tickets={visibleTickets}
          loading={queueLoading}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          selectedId={selectedId}
          onSelect={setSelectedId}
          selectedIds={checkedIds}
          onToggleSelected={(id) =>
            setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
          }
          onSelectAllShown={(ids) => setCheckedIds(ids)}
          onClearSelection={() => setCheckedIds([])}
          onBulkClose={handleBulkClose}
          bulkBusy={bulkBusy}
        />

        {ticket && (
          <TicketDetail
            ticket={ticket}
            teams={teams}
            busy={busy}
            onClaim={() => run(() => patchTicket(ticket.id, { resolverId: session.resolver.id }))}
            onReassign={(newTeamId) => run(() => patchTicket(ticket.id, { teamId: newTeamId }))}
            onReply={(body) => run(() => reply(ticket.id, body))}
            onEscalate={(reason) => run(() => escalate(ticket.id, reason))}
            onResolve={() => run(() => patchTicket(ticket.id, { status: "RESOLVED" }))}
            onReopen={(reason) => run(() => reopenTicket(ticket.id, reason))}
          />
        )}
      </div>
    </div>
  );
}
