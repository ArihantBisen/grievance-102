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
