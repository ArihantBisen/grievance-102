import type { TicketStatus } from "@sboss/shared-types";
import type { TicketListItem } from "../types";
import { StatusBadge } from "./StatusBadge";
import { SlaIndicator } from "./SlaIndicator";

const STATUS_OPTIONS: TicketStatus[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CUSTOMER",
  "NEEDS_RESOLVER_INPUT",
  "ESCALATED",
  "REASSIGNED",
  "RESOLVED",
  "CLOSED",
];

interface Props {
  tickets: TicketListItem[];
  loading: boolean;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Queue({ tickets, loading, statusFilter, onStatusFilterChange, selectedId, onSelect }: Props) {
  return (
    <div className="queue-panel card">
      <div className="filter-bar" style={{ padding: "12px 14px 0" }}>
        <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="hint" style={{ alignSelf: "center", color: "var(--sub)", fontSize: 12 }}>
          {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading && <div className="empty-state">Loading…</div>}
      {!loading && tickets.length === 0 && <div className="empty-state">No tickets in this queue.</div>}

      {!loading &&
        tickets.map((t) => (
          <div
            key={t.id}
            className={`ticket-row${t.id === selectedId ? " selected" : ""}`}
            onClick={() => onSelect(t.id)}
          >
            <span className="ticket-id">{t.id.slice(-8)}</span>
            <span className="ticket-cat">
              {t.category.name}
              {t.subcategory ? ` · ${t.subcategory.name}` : ""}
              {t.isConfidential && " 🔒"}
            </span>
            <StatusBadge status={t.status} />
            <SlaIndicator createdAt={t.createdAt} tatDueAt={t.tatDueAt} breached={t.breached} />
          </div>
        ))}
    </div>
  );
}
