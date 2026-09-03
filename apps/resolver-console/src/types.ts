import type { SenderType, TicketStatus, TicketType } from "@sboss/shared-types";

export interface Team {
  id: string;
  name: string;
  departmentId: string;
  isConfidential: boolean;
  department?: { id: string; name: string };
}

export interface Resolver {
  id: string;
  name: string;
  email: string;
  teamId: string;
  presenceStatus: "ONLINE" | "OFFLINE" | "AWAY";
  isAdmin: boolean;
}

export interface TicketListItem {
  id: string;
  ticketType: TicketType;
  status: TicketStatus;
  priority: string;
  channel: string;
  isConfidential: boolean;
  breached: boolean;
  createdAt: string;
  tatDueAt: string;
  resolvedAt: string | null;
  closureReason: string | null;
  reopenCount: number;
  lastReopenedAt: string | null;
  resolverId: string | null;
  category: { id: string; name: string };
  subcategory: { id: string; name: string } | null;
  team: { id: string; name: string };
  resolver: Resolver | null;
}

export interface Message {
  id: string;
  senderType: SenderType;
  body: string;
  channelType: string;
  deliveryStatus: string;
  sentAt: string;
}

export interface Attachment {
  id: string;
  fileUrl: string;
  uploadedBy: string;
}

// The four buckets the queue dashboard counts by. Deliberately coarser than
// TicketStatus — a resolver thinks in "new / working on it / done / came back",
// not in the seven mid-flight statuses the workflow actually uses.
export type QueueBucket = "new" | "inProgress" | "closed" | "reopened";

export interface QueueSummary {
  new: number;
  inProgress: number;
  closed: number;
  reopened: number;
  breached: number;
}

export interface BulkCloseResult {
  closedCount: number;
  skippedCount: number;
  ticketIds: string[];
}

export interface TicketDetail extends TicketListItem {
  identity: { id: string; name: string; role: string };
  messages: Message[];
  attachments: Attachment[];
  referenceNote: string | null;
}
