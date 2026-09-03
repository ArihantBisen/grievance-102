import { useState } from "react";
import type { Team, TicketDetail as TicketDetailType } from "../types";
import { StatusBadge } from "./StatusBadge";
import { SlaIndicator } from "./SlaIndicator";

interface Props {
  ticket: TicketDetailType;
  teams: Team[];
  onClaim: () => void;
  onReassign: (teamId: string) => void;
  onReply: (body: string) => void;
  onEscalate: (reason: string) => void;
  onResolve: () => void;
  onReopen: (reason: string) => void;
  busy: boolean;
}

// Mirrors the API's own limits (apps/api tickets route) so the button can explain
// itself before the request is made rather than only failing afterwards. The API
// remains the authority — this is a courtesy, not the enforcement.
const REOPEN_WINDOW_DAYS = 3;
const REOPEN_LIMIT = 2;

export function TicketDetail({
  ticket,
  teams,
  onClaim,
  onReassign,
  onReply,
  onEscalate,
  onResolve,
  onReopen,
  busy,
}: Props) {
  const [replyBody, setReplyBody] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [showEscalate, setShowEscalate] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [showReopen, setShowReopen] = useState(false);

  const isClosed = ticket.status === "RESOLVED" || ticket.status === "CLOSED";
  const daysSinceResolved = ticket.resolvedAt
    ? (Date.now() - new Date(ticket.resolvedAt).getTime()) / (24 * 60 * 60 * 1000)
    : null;
  const withinReopenWindow = daysSinceResolved !== null && daysSinceResolved <= REOPEN_WINDOW_DAYS;
  const reopensLeft = REOPEN_LIMIT - ticket.reopenCount;
  const canReopen = isClosed && withinReopenWindow && reopensLeft > 0;

  const reopenBlockedReason = !isClosed
    ? null
    : !withinReopenWindow
      ? `Resolved more than ${REOPEN_WINDOW_DAYS} days ago — raise a new ticket instead.`
      : reopensLeft <= 0
        ? `Already reopened ${REOPEN_LIMIT} times — raise a new ticket instead.`
        : null;

  return (
    <div className="detail-panel card">
      <div className="detail-header">
        <div>
          <h2>
            {ticket.category.name}
            {ticket.subcategory ? ` · ${ticket.subcategory.name}` : ""}
          </h2>
          <div className="detail-meta">
            {ticket.identity.name} ({ticket.identity.role}) · {ticket.ticketType} ·{" "}
            <span className="mono">{ticket.id}</span>
          </div>
          {ticket.referenceNote && <div className="detail-meta">Ref: {ticket.referenceNote}</div>}
          {ticket.isConfidential && (
            <div style={{ marginTop: 4 }}>
              <span className="badge badge-purple">Confidential</span>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <StatusBadge status={ticket.status} />
          <div style={{ marginTop: 6, fontSize: 12 }}>
            <SlaIndicator createdAt={ticket.createdAt} tatDueAt={ticket.tatDueAt} breached={ticket.breached} />
          </div>
        </div>
      </div>

      <div className="action-bar">
        <button className="btn" onClick={onClaim} disabled={busy || Boolean(ticket.resolver)}>
          {ticket.resolver ? `Claimed: ${ticket.resolver.name}` : "Claim"}
        </button>

        <select
          value=""
          onChange={(e) => e.target.value && onReassign(e.target.value)}
          disabled={busy}
        >
          <option value="">Reassign to…</option>
          {teams
            .filter((t) => t.id !== ticket.team.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>

        <button className="btn" onClick={() => setShowEscalate((v) => !v)} disabled={busy}>
          Escalate
        </button>

        <button className="btn btn-primary" onClick={onResolve} disabled={busy || isClosed}>
          Mark Resolved
        </button>

        {isClosed && (
          <button
            className="btn"
            onClick={() => setShowReopen((v) => !v)}
            disabled={busy || !canReopen}
            title={reopenBlockedReason ?? `${reopensLeft} reopen${reopensLeft === 1 ? "" : "s"} left`}
          >
            Reopen{canReopen ? ` (${reopensLeft} left)` : ""}
          </button>
        )}
      </div>

      {isClosed && reopenBlockedReason && (
        <div className="action-bar">
          <span className="hint">{reopenBlockedReason}</span>
        </div>
      )}

      {ticket.closureReason && (
        <div className="action-bar">
          <span className="hint">
            <strong>Closed because:</strong> {ticket.closureReason}
          </span>
        </div>
      )}

      {showReopen && canReopen && (
        <div className="action-bar">
          <input
            type="text"
            placeholder="Why is this being reopened? (optional)"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={() => {
              onReopen(reopenReason);
              setReopenReason("");
              setShowReopen(false);
            }}
            disabled={busy}
          >
            Confirm Reopen
          </button>
        </div>
      )}

      {showEscalate && (
        <div className="action-bar">
          <input
            type="text"
            placeholder="Reason (optional)"
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-danger"
            onClick={() => {
              onEscalate(escalateReason);
              setEscalateReason("");
              setShowEscalate(false);
            }}
            disabled={busy}
          >
            Confirm Escalate
          </button>
        </div>
      )}

      <div className="thread">
        {ticket.messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.senderType.toLowerCase()}`}>
            <div className="msg-meta">
              {m.senderType} · {m.channelType} · {new Date(m.sentAt).toLocaleString()}
            </div>
            {m.body}
          </div>
        ))}
        {ticket.attachments.length > 0 && (
          <div className="msg msg-system">
            <div className="msg-meta">Attachments</div>
            {ticket.attachments.map((a) => (
              <div key={a.id} className="mono" style={{ fontSize: 12 }}>
                {a.fileUrl}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="reply-box">
        <textarea
          placeholder="Reply to the requester…"
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
        />
        <div className="reply-actions">
          <button
            className="btn btn-primary"
            disabled={busy || !replyBody.trim()}
            onClick={() => {
              onReply(replyBody);
              setReplyBody("");
            }}
          >
            Send Reply
          </button>
        </div>
      </div>
    </div>
  );
}
