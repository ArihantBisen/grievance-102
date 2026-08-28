import { useEffect, useState } from "react";
import { escalate, fetchQueue, fetchTeams, fetchTicket, patchTicket, reply } from "./api";
import { LoginScreen } from "./components/LoginScreen";
import { Queue } from "./components/Queue";
import { TicketDetail } from "./components/TicketDetail";
import { clearSession, loadSession, saveSession, type Session } from "./auth";
import type { Team, TicketDetail as TicketDetailType, TicketListItem } from "./types";

// JWT auth (Part E step 8, built fresh this pass — no CRM monorepo was reachable to
// reuse from). RLS on the API side means a non-admin session only ever sees their own
// team's tickets regardless of what's requested here — the team picker below exists
// only for admins, who bypass that scoping.
export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilter, setTeamFilter] = useState(""); // admin-only: view a specific team's queue

  const [statusFilter, setStatusFilter] = useState("");
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketDetailType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }

  useEffect(refreshQueue, [session, teamFilter, statusFilter]);

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

      {error && (
        <div style={{ background: "var(--red-soft)", color: "var(--red)", border: "1px solid var(--red-line)", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="layout">
        <Queue
          tickets={tickets}
          loading={queueLoading}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          selectedId={selectedId}
          onSelect={setSelectedId}
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
          />
        )}
      </div>
    </div>
  );
}
