import type { CreateTicketRequest } from "@sboss/shared-types";
import type { DepartmentTree, IdentityContext } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchIdentity(identityId: string): Promise<IdentityContext> {
  return fetch(`/api/identity/${identityId}`).then((r) => json<IdentityContext>(r));
}

export function fetchCategories(role: string, ticketType: string): Promise<DepartmentTree[]> {
  const params = new URLSearchParams({ role, ticketType });
  return fetch(`/api/categories?${params}`).then((r) => json<DepartmentTree[]>(r));
}

export function createTicket(payload: CreateTicketRequest): Promise<{ id: string }> {
  return fetch("/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => json<{ id: string }>(r));
}

export function addAttachment(ticketId: string, fileUrl: string, uploadedBy: string) {
  return fetch(`/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl, uploadedBy }),
  }).then((r) => json(r));
}

export function uploadFile(file: File): Promise<{ fileUrl: string }> {
  const form = new FormData();
  form.append("file", file);
  return fetch("/api/uploads", { method: "POST", body: form }).then((r) => json<{ fileUrl: string }>(r));
}
