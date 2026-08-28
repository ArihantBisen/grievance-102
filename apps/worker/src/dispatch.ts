import { getPrismaClient } from "@sboss/db";
import type { NotificationSender } from "./notificationSender";

const prisma = getPrismaClient();

// D2/D2b (do-not-cut per the build spec): outside WhatsApp's 24hr customer-service
// window, an outbound send must be an approved TEMPLATE, not FREETEXT. The API already
// decides this once at message-creation time (apps/api's tickets route); this is the
// same check re-applied at dispatch time, in case a message sat PENDING (worker down,
// backlog) long enough for the window to have closed since it was written.
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

// No persisted retry-attempt counter exists on Message (a deliberate skeleton choice —
// adding one is a one-line schema change if real backoff tuning is ever needed). Instead,
// failures are retried simply by being left PENDING for the next poll cycle; a message
// that's been failing for longer than this window is given up on and flagged
// notification_failed (A3), matching the spec's language even without a counter.
const RETRY_GIVEUP_MS = 15 * 60 * 1000;

export async function dispatchPendingMessages(sender: NotificationSender): Promise<{
  dispatched: number;
  failed: number;
  gaveUp: number;
}> {
  const pending = await prisma.message.findMany({
    where: {
      deliveryStatus: "PENDING",
      senderType: { in: ["RESOLVER", "SYSTEM"] },
    },
    include: { ticket: { include: { identity: true } } },
    orderBy: { sentAt: "asc" },
    take: 50,
  });

  let dispatched = 0;
  let failed = 0;
  let gaveUp = 0;

  for (const message of pending) {
    const { ticket } = message;
    const outsideWindow =
      !ticket.lastInboundAt || Date.now() - ticket.lastInboundAt.getTime() > WHATSAPP_WINDOW_MS;
    const effectiveChannelType = outsideWindow ? "TEMPLATE" : message.channelType;

    try {
      await sender.send({
        ticketId: ticket.id,
        channel: ticket.channel,
        messageChannelType: effectiveChannelType,
        body: message.body,
        toPhoneNumber: ticket.identity.personalMobileNo ?? ticket.identity.officeMobileNo,
      });

      await prisma.message.update({
        where: { id: message.id },
        data: {
          deliveryStatus: "SENT",
          channelType: effectiveChannelType,
          deliveryError: null,
        },
      });
      dispatched++;
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      const ageMs = Date.now() - message.sentAt.getTime();

      if (ageMs > RETRY_GIVEUP_MS) {
        await prisma.message.update({
          where: { id: message.id },
          data: { deliveryStatus: "FAILED", deliveryError: errorText },
        });
        gaveUp++;
      } else {
        // Left PENDING — picked up again next poll cycle. Record the error so ops can
        // see why it hasn't gone out yet without flipping it to FAILED prematurely.
        await prisma.message.update({
          where: { id: message.id },
          data: { deliveryError: errorText },
        });
        failed++;
      }
    }
  }

  return { dispatched, failed, gaveUp };
}
