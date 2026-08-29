import { Router } from "express";
import type { TicketStatus } from "@prisma/client";
import { getNotificationSender, verifyMetaSignature } from "@sboss/whatsapp-client";
import { withSystemRls } from "../lib/rls";
import { asyncHandler } from "../lib/asyncHandler";

export const webhookRouter = Router();

const sender = getNotificationSender();

const OPEN_STATUSES: TicketStatus[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CUSTOMER",
  "NEEDS_RESOLVER_INPUT",
  "ESCALATED",
  "REASSIGNED",
];

const GREETING_KEYWORDS = new Set(["hi", "hello", "hey", "start", "menu", "hii", "hola"]);

const UNKNOWN_CONTACT_REPLY =
  "This number isn't registered with SBOSS. If you're an employee and this is unexpected, " +
  "please raise it through your reporting manager or HR.";

function submissionLink(identityId: string): string {
  const base = process.env.WEBSITE_BASE_URL ?? "http://localhost:5173";
  return `${base}/?identityId=${identityId}`;
}

// GET /api/webhook/inbound — Meta's subscription handshake (D2b).
webhookRouter.get(
  "/webhook/inbound",
  (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  }
);

// POST /api/webhook/inbound — Meta calls this for inbound messages + delivery status
// updates. Citizen/system-facing (no resolver session), runs entirely under
// withSystemRls like every other unauthenticated route. Always acks 200 promptly, per
// Meta's own redelivery-on-timeout behavior — retrying a slow success as if it failed
// would just create more duplicate-delivery load for the dedup check to absorb.
webhookRouter.post(
  "/webhook/inbound",
  asyncHandler(async (req, res) => {
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret) {
      const signature = req.header("x-hub-signature-256");
      if (!req.rawBody || !verifyMetaSignature(req.rawBody, signature, appSecret)) {
        res.sendStatus(403);
        return;
      }
    }
    // No META_APP_SECRET configured (dev without Meta credentials yet) — signature
    // check is skipped so curl-simulated payloads can still be tested locally.

    res.sendStatus(200); // ack first — processing failures below are logged, not retried by us

    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? [];
        for (const message of messages) {
          if (message.type !== "text") continue; // media/interactive types: future work
          await processInboundMessage(message.id, message.from, message.text?.body ?? "").catch((err) =>
            console.error("[webhook] failed to process inbound message:", err)
          );
        }
      }
    }
  })
);

async function processInboundMessage(wamid: string, from: string, text: string): Promise<void> {
  await withSystemRls(async (tx) => {
    // Idempotency (NFR: "Meta may redeliver"): claim this wamid first. A unique-
    // constraint conflict means it's already been handled — bail out silently.
    try {
      await tx.inboundMessageDedup.create({ data: { id: wamid } });
    } catch {
      return;
    }

    const identity = await tx.identity.findFirst({
      where: {
        OR: [{ personalMobileNo: from }, { officeMobileNo: from }],
        employmentStatus: "ACTIVE",
      },
    });

    if (!identity) {
      // ADR-011: log, decline politely, no ticket created, no admin alert.
      await tx.unknownContact.upsert({
        where: { phoneNumber: from },
        update: { attemptCount: { increment: 1 }, lastSeenAt: new Date() },
        create: { phoneNumber: from, messageBody: text },
      });
      await sender.send({
        ticketId: null,
        channel: "WHATSAPP",
        messageChannelType: "FREETEXT",
        body: UNKNOWN_CONTACT_REPLY,
        toPhoneNumber: from,
      });
      return;
    }

    const normalized = text.trim().toLowerCase();
    const openTickets = await tx.ticket.findMany({
      where: { identityId: identity.id, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: "desc" },
      include: { category: true },
    });

    if (GREETING_KEYWORDS.has(normalized) || openTickets.length === 0) {
      await sender.send({
        ticketId: null,
        channel: "WHATSAPP",
        messageChannelType: "FREETEXT",
        body: `Hi ${identity.name.split(" ")[0]}, please use this link to submit a grievance or request: ${submissionLink(identity.id)}`,
        toPhoneNumber: from,
      });
      return;
    }

    if (normalized === "status") {
      const summary = openTickets
        .slice(0, 5)
        .map((t) => `• ${t.id.slice(-8)} — ${t.category.name} — ${t.status.replace(/_/g, " ")}`)
        .join("\n");
      await sender.send({
        ticketId: null,
        channel: "WHATSAPP",
        messageChannelType: "FREETEXT",
        body: `Your open tickets:\n${summary}`,
        toPhoneNumber: from,
      });
      return;
    }

    if (openTickets.length > 1) {
      const list = openTickets
        .slice(0, 5)
        .map((t) => `• ${t.id.slice(-8)} — ${t.category.name}`)
        .join("\n");
      await sender.send({
        ticketId: null,
        channel: "WHATSAPP",
        messageChannelType: "FREETEXT",
        body: `Which ticket is this about? Reply with the reference:\n${list}`,
        toPhoneNumber: from,
      });
      return;
    }

    // Exactly one open ticket — append as a USER reply. No immediate outbound send;
    // the resolver picks it up from the console, same as any other inbound reply.
    const ticket = openTickets[0];
    await tx.message.create({
      data: { ticketId: ticket.id, senderType: "USER", body: text, channelType: "FREETEXT" },
    });

    const updateData: Record<string, unknown> = { lastInboundAt: new Date() };
    if (ticket.status === "AWAITING_CUSTOMER") updateData.status = "NEEDS_RESOLVER_INPUT";
    await tx.ticket.update({ where: { id: ticket.id }, data: updateData });

    if (updateData.status) {
      await tx.auditLog.create({
        data: {
          ticketId: ticket.id,
          actor: "user",
          action: "STATUS_CHANGED",
          fromValue: ticket.status,
          toValue: updateData.status as string,
        },
      });
    }
  });
}
