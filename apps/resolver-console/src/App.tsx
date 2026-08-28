import { useEffect, useState } from "react";
import { escalate, fetchQueue, fetchResolvers, fetchTeams, fetchTicket, patchTicket, reply } from "./api";
import { Queue } from "./components/Queue";
import { TicketDetail } from "./components/TicketDetail";
import type { Resolver, Team, TicketDetail as TicketDetailType, TicketListItem } from "./types";

// No login yet — JWT auth (Part E step 8) will derive team/resolver from a session.
// Until then, a team + "acting as" resolver picker stands in for that session, same
// posture as the API's deferred-auth query-param scoping.
export function App() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [resolvers, setResolvers] = useState<Resolver[]>([]);
  const [actingResolverId, setActingResolverId] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketDetailType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTeams().then(setTeams).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!teamId) return;
    fetchResolvers(teamId).then(setResolvers).catch((e) => setError(e.message));
    setActingResolverId("");
  }, [teamId]);

  function refreshQueue() {
    if (!teamId) return;
    setQueueLoading(true);
    fetchQueue(teamId, statusFilter || undefined)
      .then(setTickets)
      .catch((e) => setError(e.message))
      .finally(() => setQueueLoading(false));
  }

  useEffect(refreshQueue, [teamId, statusFilter]);

  function refreshTicket(id: string) {
    fetchTicket(id).then(setTicket).catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (selectedId) refreshTicket(selectedId);
    else setTicket(null);
  }, [selectedId]);

  const actingResolver = resolvers.find((r) => r.id === actingResolverId) ?? null;

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

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>Resolver Console</h1>
        <div className="session-picker">
          <select value={teamId} onChange={(e) => { setTeamId(e.target.value); setSelectedId(null); }}>
            <option value="">Select a team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isConfidential ? " (confidential)" : ""}
              </option>
            ))}
          </select>
          <select
            value={actingResolverId}
            onChange={(e) => setActingResolverId(e.target.value)}
            disabled={!teamId}
          >
            <option value="">Acting as…</option>
            {resolvers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error-banner" style={{ background: "var(--red-soft)", color: "var(--red)", border: "1px solid var(--red-line)", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {!teamId && <div className="empty-state card">Pick a team above to see its queue.</div>}

      {teamId && (
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
              actingResolver={actingResolver}
              busy={busy}
              onClaim={() =>
                actingResolver &&
                run(() =>
                  patchTicket(ticket.id, { resolverId: actingResolver.id, actor: actingResolver.email })
                )
              }
              onReassign={(newTeamId) =>
                run(() =>
                  patchTicket(ticket.id, {
                    teamId: newTeamId,
                    actor: actingResolver?.email ?? "resolver",
                  })
                )
              }
              onReply={(body) => run(() => reply(ticket.id, body))}
              onEscalate={(reason) =>
                run(() => escalate(ticket.id, actingResolver?.email ?? "resolver", reason))
              }
              onResolve={() =>
                run(() =>
                  patchTicket(ticket.id, { status: "RESOLVED", actor: actingResolver?.email ?? "resolver" })
                )
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
