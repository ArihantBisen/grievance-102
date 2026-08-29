// Built behind an interface so swapping in the real Meta Cloud API / email client later
// doesn't touch call sites — same pattern ADR-003 used for keeping the WhatsApp BSP
// choice reversible. Used by both apps/worker (dispatching Message rows tied to a
// ticket) and apps/api's webhook handler (ticket-less exchanges — the initial "Hi",
// a status-check reply, an unknown-contact decline — hence ticketId is nullable).

export interface OutboundNotification {
  ticketId: string | null;
  channel: "WHATSAPP" | "WEB";
  messageChannelType: "FREETEXT" | "TEMPLATE";
  body: string;
  toPhoneNumber: string | null;
}

export interface NotificationSender {
  send(notification: OutboundNotification): Promise<void>;
}
