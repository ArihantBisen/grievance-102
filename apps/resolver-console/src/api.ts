import type { Resolver, Team, TicketDetail, TicketListItem } from "./types";
import { loadSession } from "./auth";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function authHeaders(): Record<string, string> {
  const session = loadSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

export function login(email: string, password: string) {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => json<{ token: string; resolver: Resolver }>(r));
}

export function fetchTeams(): Promise<Team[]> {
  return fetch("/api/teams", { headers: authHeaders() }).then((r) => json<Team[]>(r));
}

export function fetchResolvers(teamId?: string): Promise<Resolver[]> {
  const qs = teamId ? `?teamId=${teamId}` : "";
  return fetch(`/api/resolvers${qs}`, { headers: authHeaders() }).then((r) => json<Resolver[]>(r));
}

export function fetchQueue(teamId?: string, status?: string): Promise<TicketListItem[]> {
  const params = new URLSearchParams();
  if (teamId) params.set("teamId", teamId);
  if (status) params.set("status", status);
  return fetch(`/api/tickets?${params}`, { headers: authHeaders() }).then((r) => json<TicketListItem[]>(r));
}

export function fetchTicket(id: string): Promise<TicketDetail> {
  return fetch(`/api/tickets/${id}`, { headers: authHeaders() }).then((r) => json<TicketDetail>(r));
}

export function patchTicket(
  id: string,
  data: { status?: string; teamId?: string; resolverId?: string | null; priority?: string }
): Promise<TicketDetail> {
  return fetch(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  }).then((r) => json<TicketDetail>(r));
}

export function reply(id: string, body: string): Promise<unknown> {
  return fetch(`/api/tickets/${id}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ senderType: "RESOLVER", body }),
  }).then((r) => json(r));
}

export function escalate(id: string, reason: string): Promise<TicketDetail> {
  return fetch(`/api/tickets/${id}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ reason: reason || undefined }),
  }).then((r) => json<TicketDetail>(r));
}
