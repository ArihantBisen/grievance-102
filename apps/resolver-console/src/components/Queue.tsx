import { useState } from "react";
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
  "REOPENED",
  "RESOLVED",
  "CLOSED",
];

// Only an open ticket can be bulk-closed; already-closed rows stay selectable-free so
// the count on the button is always the number that will actually change.
const CLOSED_STATUSES: TicketStatus[] = ["RESOLVED", "CLOSED"];

interface Props {
  tickets: TicketListItem[];
  loading: boolean;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
  onSelectAllShown: (ids: string[]) => void;
  onClearSelection: () => void;
  onBulkClose: (reason: string) => void;
  bulkBusy: boolean;
}

export function Queue({
  tickets,
  loading,
  statusFilter,
  onStatusFilterChange,
  selectedId,
  onSelect,
  selectedIds,
  onToggleSelected,
  onSelectAllShown,
  onClearSelection,
  onBulkClose,
  bulkBusy,
}: Props) {
  const [reason, setReason] = useState("");

  const closable = tickets.filter((t) => !CLOSED_STATUSES.includes(t.status));
  const selectedSet = new Set(selectedIds);
  const allShownSelected = closable.length > 0 && closable.every((t) => selectedSet.has(t.id));

  function submitBulkClose() {
    onBulkClose(reason);
    setReason("");
  }

  return (
    <div className="queue-panel card">
      <div className="filter-bar" style={{ padding: "14px 14px 0" }}>
        <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="hint" style={{ alignSelf: "center" }}>
          {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
        </span>
        {closable.length > 0 && (
          <label className="select-all">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={() => (allShownSelected ? onClearSelection() : onSelectAllShown(closable.map((t) => t.id)))}
            />
            Select all shown
          </label>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="bulk-bar">
          <div className="bulk-bar-head">
            <strong>{selectedIds.length} selected</strong>
            <button className="btn-linklike" type="button" onClick={onClearSelection}>
              Clear
            </button>
          </div>
          <textarea
            placeholder="How were these resolved? This is sent to the requester on WhatsApp and saved on each ticket."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <button
            className="btn btn-primary"
            type="button"
            disabled={bulkBusy || reason.trim().length === 0}
            onClick={submitBulkClose}
          >
            {bulkBusy ? "Closing…" : `Close ${selectedIds.length} ticket${selectedIds.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {loading && <div className="empty-state">Loading…</div>}
      {!loading && tickets.length === 0 && <div className="empty-state">No tickets in this queue.</div>}

      {!loading &&
        tickets.map((t) => {
          const isClosed = CLOSED_STATUSES.includes(t.status);
          return (
            <div
              key={t.id}
              className={`ticket-row${t.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              <input
                type="checkbox"
                className="row-check"
                checked={selectedSet.has(t.id)}
                disabled={isClosed}
                title={isClosed ? "Already closed" : "Select for bulk close"}
                // The row itself opens the ticket; the checkbox must not also do that.
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelected(t.id)}
              />
              <span className="ticket-id">{t.id.slice(-8)}</span>
              <span className="ticket-cat">
                {t.category.name}
                {t.subcategory ? ` · ${t.subcategory.name}` : ""}
                {t.isConfidential && " 🔒"}
              </span>
              <StatusBadge status={t.status} />
              <SlaIndicator createdAt={t.createdAt} tatDueAt={t.tatDueAt} breached={t.breached} />
            </div>
          );
        })}
    </div>
  );
}
