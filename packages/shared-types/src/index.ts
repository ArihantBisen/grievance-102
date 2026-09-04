// Types shared across apps (API, consoles, website). Kept independent of
// @prisma/client so non-API apps (e.g. React consoles) don't need Prisma as
// a dependency just to share request/response shapes.
//
// Mirrors packages/db/prisma/schema.prisma exactly (Role, Channel, SenderType,
// MessageChannel and TicketStatus are all-uppercase enum values per the spec's
// Part D1 schema) — do not reintroduce grievance-101's older lowercase/Segment
// conventions here.

export type Role =
  | "SBOSS_STAFF"
  | "SBI_DEPUTED"
  | "CM"
  | "TM"
  | "TEAM_LEAD"
  | "FOS"
  | "SEVA_SARATHI"
  | "OTHER";

export type TicketType = "GRIEVANCE" | "REQUEST";

export type TicketStatus =
  | "NEW"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "AWAITING_CUSTOMER"
  | "NEEDS_RESOLVER_INPUT"
  | "ESCALATED"
  | "REASSIGNED"
  | "REOPENED"
  | "RESOLVED"
  | "CLOSED";

export type Channel = "WHATSAPP" | "WEB";

export type SenderType = "USER" | "RESOLVER" | "SYSTEM";

export type MessageChannel = "FREETEXT" | "TEMPLATE";

export interface CreateTicketRequest {
  identityId: string;
  categoryId: string;
  subcategoryId: string;
  channel: Channel;
  ticketType?: TicketType;
  referenceNote?: string;
  priority?: string;
  body?: string; // initial message text, if any
}

export interface UpdateTicketRequest {
  status?: TicketStatus;
  teamId?: string;
  resolverId?: string | null;
  priority?: string;
  actor: string; // required for audit attribution
}

export interface ReplyRequest {
  senderType: SenderType;
  body: string;
  channelType?: MessageChannel;
}

export interface EscalateRequest {
  actor: string;
  reason?: string;
}

export interface AttachmentRequest {
  fileUrl: string;
  uploadedBy: string;
  messageId?: string;
}

// Global ticket-number formatting ("#IT-00001") — one counter shared across every
// department (TicketSequence in packages/db), not a per-department count. The prefix
// just labels which department a ticket belongs to; the digits reflect overall
// grievance-creation order system-wide. See apps/api's tickets route for where the
// counter is atomically claimed, and webhook.ts for how a citizen's typed-back
// reference gets matched against it.
export function formatTicketNumber(prefix: string, counter: number): string {
  return `#${prefix}-${String(counter).padStart(5, "0")}`;
}

// Loosens an inbound WhatsApp reply enough to match a ticket number typed with
// inconsistent punctuation/spacing/case ("IT-00001", "#it00001", "it 00001 fyi") — strips
// everything but letters and digits from both sides before comparing, so only the
// meaningful characters matter.
export function stripToAlphanumeric(text: string): string {
  return text.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
