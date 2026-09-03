import { Router } from "express";
import type { TicketStatus } from "@prisma/client";
import { fetchMetaMedia, getNotificationSender, verifyMetaSignature } from "@sboss/whatsapp-client";
import { withSystemRls } from "../lib/rls";
import { asyncHandler } from "../lib/asyncHandler";
import { LocalDiskStorage } from "../lib/storage";

export const webhookRouter = Router();

const sender = getNotificationSender();
const storage = new LocalDiskStorage();

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
          if (message.type === "text") {
            await processInboundMessage(message.id, message.from, message.text?.body ?? "").catch((err) =>
              console.error("[webhook] failed to process inbound message:", err)
            );
          } else if (message.type === "image" || message.type === "document") {
            await processInboundMedia(message.id, message.from, message).catch((err) =>
              console.error("[webhook] failed to process inbound media:", err)
            );
          }
          // Other types (video/audio/interactive/etc.): still future work.
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

    // With more than one open ticket, a reply is only unambiguous once it's tied to a
    // specific ticket — either there's exactly one open ticket already, or the citizen
    // led with that ticket's reference (the code the disambiguation prompt below hands
    // out), e.g. "9j6rl0me still waiting on this". Without this match, the prompt below
    // had no way to ever resolve — every reply just asked the same question again.
    let ticket = openTickets.length === 1 ? openTickets[0] : null;
    if (!ticket && openTickets.length > 1) {
      ticket = openTickets.find((t) => normalized.startsWith(t.id.slice(-8).toLowerCase())) ?? null;
    }

    if (!ticket) {
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

    // Append as a USER reply. No immediate outbound send; the resolver picks it up
    // from the console, same as any other inbound reply.
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

interface InboundMediaMessage {
  type: "image" | "document";
  image?: { id: string; caption?: string; mime_type?: string };
  document?: { id: string; caption?: string; filename?: string; mime_type?: string };
}

// Companion to processInboundMessage for image/document messages (D2b's other stated
// scope — attachments). WhatsApp only ever hands the webhook a media ID; the actual
// bytes have to be fetched from Meta separately (fetchMetaMedia) before they can be
// saved through the same StorageBackend the website's upload flow already uses, so
// Attachment.fileUrl behaves identically regardless of which channel it came in on.
async function processInboundMedia(wamid: string, from: string, message: InboundMediaMessage): Promise<void> {
  await withSystemRls(async (tx) => {
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
      await tx.unknownContact.upsert({
        where: { phoneNumber: from },
        update: { attemptCount: { increment: 1 }, lastSeenAt: new Date() },
        create: { phoneNumber: from, messageBody: `[${message.type} attachment]` },
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

    const openTickets = await tx.ticket.findMany({
      where: { identityId: identity.id, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: "desc" },
      include: { category: true },
    });

    // Same single-open-ticket rule as text replies, minus the reference-code match —
    // asking someone to caption a photo with a ticket code is a worse experience than
    // asking them to send one line of text first, so multi-ticket attachments just
    // point back at the plain disambiguation prompt (still text-answerable) instead.
    if (openTickets.length !== 1) {
      const body =
        openTickets.length === 0
          ? `Hi ${identity.name.split(" ")[0]}, please use this link to submit a grievance or request: ${submissionLink(identity.id)}`
          : `Which ticket is this attachment for? Reply with the reference, then resend the file:\n${openTickets
              .slice(0, 5)
              .map((t) => `• ${t.id.slice(-8)} — ${t.category.name}`)
              .join("\n")}`;
      await sender.send({ ticketId: null, channel: "WHATSAPP", messageChannelType: "FREETEXT", body, toPhoneNumber: from });
      return;
    }
    const ticket = openTickets[0];

    const media = message.type === "image" ? message.image : message.document;
    if (!media) return;

    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      // Dev/stub mode (no real Meta credentials yet) — there's no real media to fetch.
      console.warn("[webhook] received a media message but META_ACCESS_TOKEN is unset; skipping download");
      return;
    }

    const { buffer, mimeType } = await fetchMetaMedia(media.id, {
      accessToken,
      apiVersion: process.env.META_API_VERSION,
    });
    const originalFilename =
      (message.type === "document" ? message.document?.filename : undefined) ??
      `${media.id}.${mimeType.split("/")[1] ?? "bin"}`;
    const { url } = await storage.save(buffer, originalFilename);

    const created = await tx.message.create({
      data: {
        ticketId: ticket.id,
        senderType: "USER",
        body: media.caption || `[${message.type} attachment]`,
        channelType: "FREETEXT",
      },
    });

    await tx.attachment.create({
      data: { ticketId: ticket.id, messageId: created.id, fileUrl: url, uploadedBy: `identity:${identity.id}` },
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
