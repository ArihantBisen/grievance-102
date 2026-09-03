import { loadSession, type AdminResolver } from "./auth";
import type {
  BulkCloseResult,
  Department,
  Identity,
  OrphanedTicket,
  ReportsSummary,
  Resolver,
  SyncRun,
  Team,
  UnknownContact,
} from "./types";

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

function jsonHeaders() {
  return { "Content-Type": "application/json", ...authHeaders() };
}

export function login(email: string, password: string) {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => json<{ token: string; resolver: AdminResolver }>(r));
}

// GET /api/categories with no role filter returns the full, unfiltered tree (spec D2).
export function fetchCategoryTree(): Promise<Department[]> {
  return fetch("/api/categories", { headers: authHeaders() }).then((r) => json<Department[]>(r));
}

export function patchCategory(id: string, data: Record<string, unknown>) {
  return fetch(`/api/categories/${id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(data) }).then(
    (r) => json(r)
  );
}

export function patchSubcategory(id: string, data: Record<string, unknown>) {
  return fetch(`/api/subcategories/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  }).then((r) => json(r));
}

export function fetchTeams(): Promise<Team[]> {
  return fetch("/api/teams", { headers: authHeaders() }).then((r) => json<Team[]>(r));
}

export function fetchResolvers(): Promise<Resolver[]> {
  return fetch("/api/resolvers", { headers: authHeaders() }).then((r) => json<Resolver[]>(r));
}

export function createResolver(data: { name: string; email: string; teamId: string; password: string; isAdmin: boolean }) {
  return fetch("/api/resolvers", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(data) }).then((r) =>
    json<Resolver>(r)
  );
}

export function patchResolver(id: string, data: Record<string, unknown>) {
  return fetch(`/api/resolvers/${id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(data) }).then(
    (r) => json<Resolver>(r)
  );
}

export function fetchIdentities(params: { role?: string; employmentStatus?: string; search?: string }): Promise<Identity[]> {
  const qs = new URLSearchParams();
  if (params.role) qs.set("role", params.role);
  if (params.employmentStatus) qs.set("employmentStatus", params.employmentStatus);
  if (params.search) qs.set("search", params.search);
  return fetch(`/api/admin/identities?${qs}`, { headers: authHeaders() }).then((r) => json<Identity[]>(r));
}

export function patchIdentityRole(id: string, role: string) {
  return fetch(`/api/admin/identities/${id}/role`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ role }),
  }).then((r) => json<Identity>(r));
}

export function fetchUnknownContacts(reviewed?: boolean): Promise<UnknownContact[]> {
  const qs = reviewed === undefined ? "" : `?reviewed=${reviewed}`;
  return fetch(`/api/admin/unknown-contacts${qs}`, { headers: authHeaders() }).then((r) =>
    json<UnknownContact[]>(r)
  );
}

export function markUnknownContactReviewed(id: string) {
  return fetch(`/api/admin/unknown-contacts/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  }).then((r) => json(r));
}

export function fetchOrphanedTickets(): Promise<OrphanedTicket[]> {
  return fetch("/api/admin/orphaned-tickets", { headers: authHeaders() }).then((r) => json<OrphanedTicket[]>(r));
}

export function fetchSyncRuns(): Promise<SyncRun[]> {
  return fetch("/api/admin/sync-runs", { headers: authHeaders() }).then((r) => json<SyncRun[]>(r));
}

export interface Metrics {
  apiUptimeSeconds: number;
  lastInboundWebhookAt: string | null;
  outboxQueueDepth: number;
  failedDispatchCount: number;
  breachedTicketCount: number;
}

export function fetchMetrics(): Promise<Metrics> {
  return fetch("/api/admin/metrics", { headers: authHeaders() }).then((r) => json<Metrics>(r));
}

export function fetchReportsSummary(): Promise<ReportsSummary> {
  return fetch("/api/admin/reports/summary", { headers: authHeaders() }).then((r) => json<ReportsSummary>(r));
}

export interface BulkCloseFilters {
  ticketIds?: string[];
  identityId?: string;
  teamId?: string;
  olderThanHours?: number;
  targetStatus?: "RESOLVED" | "CLOSED";
}

export function bulkCloseTickets(filters: BulkCloseFilters): Promise<BulkCloseResult> {
  return fetch("/api/admin/tickets/bulk-close", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(filters),
  }).then((r) => json<BulkCloseResult>(r));
}
