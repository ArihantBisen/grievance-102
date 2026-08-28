import { useState } from "react";
import type { Resolver, Team, TicketDetail as TicketDetailType } from "../types";
import { StatusBadge } from "./StatusBadge";
import { SlaIndicator } from "./SlaIndicator";

interface Props {
  ticket: TicketDetailType;
  teams: Team[];
  actingResolver: Resolver | null;
  onClaim: () => void;
  onReassign: (teamId: string) => void;
  onReply: (body: string) => void;
  onEscalate: (reason: string) => void;
  onResolve: () => void;
  busy: boolean;
}

export function TicketDetail({
  ticket,
  teams,
  actingResolver,
  onClaim,
  onReassign,
  onReply,
  onEscalate,
  onResolve,
  busy,
}: Props) {
  const [replyBody, setReplyBody] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [showEscalate, setShowEscalate] = useState(false);

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
        <button className="btn" onClick={onClaim} disabled={busy || !actingResolver || ticket.resolverId === actingResolver?.id}>
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

        <button
          className="btn btn-primary"
          onClick={onResolve}
          disabled={busy || ticket.status === "RESOLVED" || ticket.status === "CLOSED"}
        >
          Mark Resolved
        </button>
      </div>

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
