import type { NotificationSender, OutboundNotification } from "./types";

// No Meta/email credentials exist yet for most dev environments. This stub logs what
// would have been sent so the dispatch loop, retry, and deliveryStatus bookkeeping
// (and the webhook handler's own replies) can all be built and tested without them —
// getNotificationSender() (index.ts) picks this automatically whenever META_ACCESS_TOKEN
// isn't set.
export class LoggingNotificationSender implements NotificationSender {
  async send(notification: OutboundNotification): Promise<void> {
    console.log(
      `[stub-send] ticket=${notification.ticketId ?? "(none)"} channel=${notification.channel} ` +
        `type=${notification.messageChannelType} to=${notification.toPhoneNumber ?? "(no phone on file)"} ` +
        `body="${notification.body.slice(0, 80)}"`
    );
  }
}
