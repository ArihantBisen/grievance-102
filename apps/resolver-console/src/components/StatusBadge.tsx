import type { TicketStatus } from "@sboss/shared-types";

const STATUS_CLASS: Record<TicketStatus, string> = {
  NEW: "badge-blue",
  ASSIGNED: "badge-blue",
  IN_PROGRESS: "badge-blue",
  AWAITING_CUSTOMER: "badge-amber",
  NEEDS_RESOLVER_INPUT: "badge-amber",
  ESCALATED: "badge-red",
  REASSIGNED: "badge-amber",
  REOPENED: "badge-purple",
  RESOLVED: "badge-green",
  CLOSED: "badge-green",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{status.replace(/_/g, " ")}</span>;
}
