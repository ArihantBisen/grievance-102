import type { Resolver, Team, TicketDetail, TicketListItem } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchTeams(): Promise<Team[]> {
  return fetch("/api/teams").then((r) => json<Team[]>(r));
}

export function fetchResolvers(teamId?: string): Promise<Resolver[]> {
  const qs = teamId ? `?teamId=${teamId}` : "";
  return fetch(`/api/resolvers${qs}`).then((r) => json<Resolver[]>(r));
}

export function fetchQueue(teamId: string, status?: string): Promise<TicketListItem[]> {
  const params = new URLSearchParams({ teamId });
  if (status) params.set("status", status);
  return fetch(`/api/tickets?${params}`).then((r) => json<TicketListItem[]>(r));
}

export function fetchTicket(id: string): Promise<TicketDetail> {
  return fetch(`/api/tickets/${id}`).then((r) => json<TicketDetail>(r));
}

export function patchTicket(
  id: string,
  data: { status?: string; teamId?: string; resolverId?: string | null; priority?: string; actor: string }
): Promise<TicketDetail> {
  return fetch(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => json<TicketDetail>(r));
}

export function reply(id: string, body: string): Promise<unknown> {
  return fetch(`/api/tickets/${id}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ senderType: "RESOLVER", body }),
  }).then((r) => json(r));
}

export function escalate(id: string, actor: string, reason: string): Promise<TicketDetail> {
  return fetch(`/api/tickets/${id}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor, reason: reason || undefined }),
  }).then((r) => json<TicketDetail>(r));
}
