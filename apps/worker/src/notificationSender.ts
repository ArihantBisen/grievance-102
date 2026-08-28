// Built behind an interface so swapping in the real Meta Cloud API / email client later
// (D2b) doesn't touch the dispatch loop — same pattern ADR-003 used for keeping the
// WhatsApp BSP choice reversible.

export interface OutboundNotification {
  ticketId: string;
  channel: "WHATSAPP" | "WEB";
  messageChannelType: "FREETEXT" | "TEMPLATE";
  body: string;
  toPhoneNumber: string | null;
}

export interface NotificationSender {
  send(notification: OutboundNotification): Promise<void>;
}

// No Meta/email credentials exist yet (Business Verification hasn't started — ADR-003).
// This stub logs what would have been sent so the dispatch loop, retry, and
// deliveryStatus bookkeeping can all be built and tested now, and swapped for a real
// Meta Cloud API / email client later without touching anything else in this app.
export class LoggingNotificationSender implements NotificationSender {
  async send(notification: OutboundNotification): Promise<void> {
    console.log(
      `[stub-send] ticket=${notification.ticketId} channel=${notification.channel} ` +
        `type=${notification.messageChannelType} to=${notification.toPhoneNumber ?? "(no phone on file)"} ` +
        `body="${notification.body.slice(0, 80)}"`
    );
  }
}
