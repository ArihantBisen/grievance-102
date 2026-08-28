import { Router } from "express";
import type { Role, TicketStatus, TicketType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../lib/asyncHandler";

export const ticketsRouter = Router();

// ADR-007 (updated Aug 25): only these roles may raise a REQUEST-type ticket.
const REQUEST_ELIGIBLE_ROLES = new Set<Role>(["TEAM_LEAD", "TM", "CM", "SBI_DEPUTED"]);

// D2/D2b: WhatsApp's 24hr customer-service window. A RESOLVER message sent outside it
// must go out as an approved TEMPLATE, not FREETEXT, or Meta will reject the send.
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

const OPEN_STATUSES: TicketStatus[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CUSTOMER",
  "NEEDS_RESOLVER_INPUT",
  "ESCALATED",
  "REASSIGNED",
];

const TICKET_DETAIL_INCLUDE = {
  identity: true,
  category: true,
  subcategory: true,
  team: true,
  resolver: true,
  messages: { orderBy: { sentAt: "asc" as const } },
  attachments: true,
} as const;

const TICKET_LIST_INCLUDE = {
  category: true,
  subcategory: true,
  team: true,
  resolver: true,
} as const;

// POST /api/tickets — create ticket. Body: { identityId, categoryId, subcategoryId,
// channel, ticketType?, referenceNote?, priority?, body? } per spec D2.
// identityId is caller-supplied for now — real caller-identity resolution (from a JWT
// or an authenticated WhatsApp/webform session) arrives with JWT auth (Part E step 8);
// until then this stays body-scoped like every other route rather than session-scoped.
//
// subcategoryId is required here even though the schema marks Ticket.subcategoryId
// optional "for Requests that may skip subcategory drill-down" — Subcategory is the
// only place a resolverTeamId lives, so a subcategory-less ticket has no team to route
// to under the current schema. Treating it as required is a deliberate, narrower scope
// for this pass; revisit if/when Category grows a default team of its own.
ticketsRouter.post(
  "/tickets",
  asyncHandler(async (req, res) => {
    const { identityId, categoryId, subcategoryId, channel, ticketType, referenceNote, priority, body } =
      req.body ?? {};

    if (!identityId || !categoryId || !subcategoryId || !channel) {
      throw new HttpError(400, "identityId, categoryId, subcategoryId, and channel are required");
    }

    const requestedType: TicketType = ticketType === "REQUEST" ? "REQUEST" : "GRIEVANCE";

    const identity = await prisma.identity.findUnique({ where: { id: identityId } });
    if (!identity) throw new HttpError(404, "Identity not found");
    if (identity.employmentStatus !== "ACTIVE") {
      throw new HttpError(403, "Identity is not active");
    }

    if (requestedType === "REQUEST" && !REQUEST_ELIGIBLE_ROLES.has(identity.role)) {
      throw new HttpError(
        403,
        "Only TEAM_LEAD/TM/CM/SBI_DEPUTED-designated identities can raise a REQUEST ticket"
      );
    }

    const subcategory = await prisma.subcategory.findUnique({
      where: { id: subcategoryId },
      include: { category: true },
    });
    if (!subcategory || subcategory.categoryId !== categoryId) {
      throw new HttpError(400, "subcategoryId must belong to categoryId");
    }
    if (subcategory.category.ticketType !== requestedType) {
      throw new HttpError(
        400,
        `Category "${subcategory.category.name}" is not part of the ${requestedType} category set`
      );
    }

    const tatHours = subcategory.tatHoursOverride ?? subcategory.category.defaultTatHours;
    const tatDueAt = new Date(Date.now() + tatHours * 60 * 60 * 1000);
    const now = new Date();

    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          identityId,
          departmentId: subcategory.category.departmentId,
          categoryId,
          subcategoryId,
          teamId: subcategory.resolverTeamId,
          ticketType: requestedType,
          referenceNote: referenceNote ?? null,
          priority: priority ?? "standard",
          channel,
          // ADR-009: isConfidential is derived from the category, never client-supplied.
          isConfidential: subcategory.category.isConfidential,
          tatDueAt,
          lastInboundAt: now,
        },
      });

      if (body) {
        await tx.message.create({
          data: {
            ticketId: created.id,
            senderType: "USER",
            body,
            channelType: "FREETEXT",
          },
        });
      }

      // Outbound confirmation ("WhatsApp ticket card" + email, per spec A1). This is a
      // SYSTEM message left PENDING for the Outbox Worker to actually dispatch —
      // Message.deliveryStatus is the outbox queue (no separate OutboxEvent table
      // exists in the schema; this is the queue signal the worker polls on).
      await tx.message.create({
        data: {
          ticketId: created.id,
          senderType: "SYSTEM",
          body: `Ticket ${created.id} created. We'll notify you here as it progresses.`,
          channelType: channel === "WEB" ? "TEMPLATE" : "FREETEXT",
        },
      });

      await tx.auditLog.create({
        data: {
          ticketId: created.id,
          actor: `identity:${identityId}`,
          action: "TICKET_CREATED",
          toValue: created.status,
        },
      });

      return created;
    });

    res.status(201).json(ticket);
  })
);

// GET /api/tickets — list. NOTE: true multi-tenant RLS scoping arrives with JWT auth
// (Part E step 8); until then, callers filter explicitly via query params rather than
// the server inferring scope from a session. HR-confidential exclusion for non-committee
// callers is likewise deferred to that same step.
ticketsRouter.get(
  "/tickets",
  asyncHandler(async (req, res) => {
    const { teamId, status, ticketType, identityId } = req.query as Record<string, string | undefined>;

    const tickets = await prisma.ticket.findMany({
      where: {
        teamId: teamId || undefined,
        status: (status as TicketStatus) || undefined,
        ticketType: (ticketType as TicketType) || undefined,
        identityId: identityId || undefined,
      },
      orderBy: { createdAt: "desc" },
      include: TICKET_LIST_INCLUDE,
    });

    res.json(tickets);
  })
);

// GET /api/tickets/mine?identityId=&openOnly= — caller's own tickets. Backs (a) the
// "which ticket did you mean?" multi-ticket disambiguation and (b) the WhatsApp
// status-check conversation summary (ADR-002 action item 2). Registered before
// /tickets/:id so Express doesn't swallow "mine" as an :id param.
ticketsRouter.get(
  "/tickets/mine",
  asyncHandler(async (req, res) => {
    const { identityId, openOnly } = req.query as Record<string, string | undefined>;
    if (!identityId) throw new HttpError(400, "identityId is required");

    const tickets = await prisma.ticket.findMany({
      where: {
        identityId,
        status: openOnly === "true" ? { in: OPEN_STATUSES } : undefined,
      },
      orderBy: { createdAt: "desc" },
      include: TICKET_LIST_INCLUDE,
    });

    res.json(tickets);
  })
);

// GET /api/tickets/:id — ticket detail + thread
ticketsRouter.get(
  "/tickets/:id",
  asyncHandler(async (req, res) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: TICKET_DETAIL_INCLUDE,
    });
    if (!ticket) throw new HttpError(404, "Ticket not found");
    res.json(ticket);
  })
);

// PATCH /api/tickets/:id — update (status, teamId for reassignment, resolverId claim, priority)
ticketsRouter.patch(
  "/tickets/:id",
  asyncHandler(async (req, res) => {
    const { status, teamId, resolverId, priority, actor } = req.body ?? {};
    if (!actor) throw new HttpError(400, "actor is required for the audit log");

    const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Ticket not found");

    const data: Record<string, unknown> = {};
    const auditEntries: { action: string; fromValue: string | null; toValue: string | null }[] = [];

    if (status && status !== existing.status) {
      data.status = status;
      if (status === "RESOLVED" || status === "CLOSED") data.resolvedAt = new Date();
      auditEntries.push({ action: "STATUS_CHANGED", fromValue: existing.status, toValue: status });
    }
    if (teamId && teamId !== existing.teamId) {
      data.teamId = teamId;
      data.status = existing.status === "NEW" ? existing.status : "REASSIGNED";
      auditEntries.push({ action: "TEAM_REASSIGNED", fromValue: existing.teamId, toValue: teamId });
    }
    if (resolverId !== undefined && resolverId !== existing.resolverId) {
      data.resolverId = resolverId;
      auditEntries.push({
        action: "RESOLVER_CLAIMED",
        fromValue: existing.resolverId,
        toValue: resolverId,
      });
    }
    if (priority && priority !== existing.priority) {
      data.priority = priority;
      auditEntries.push({ action: "PRIORITY_CHANGED", fromValue: existing.priority, toValue: priority });
    }

    if (Object.keys(data).length === 0) {
      res.json(existing);
      return;
    }

    const ticket = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({ where: { id: existing.id }, data });
      if (auditEntries.length > 0) {
        await tx.auditLog.createMany({
          data: auditEntries.map((entry) => ({ ticketId: existing.id, actor, ...entry })),
        });
      }
      return updated;
    });

    res.json(ticket);
  })
);

// POST /api/tickets/:id/reply — append a message, auto-transition status, and (for a
// USER-sent message) stamp lastInboundAt, which drives the Outbox Worker's 24hr WhatsApp
// window / template-fallback check (schema comment on Ticket.lastInboundAt).
ticketsRouter.post(
  "/tickets/:id/reply",
  asyncHandler(async (req, res) => {
    const { senderType, body, channelType } = req.body ?? {};
    if (!senderType || !body) throw new HttpError(400, "senderType and body are required");

    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw new HttpError(404, "Ticket not found");

    // D2/D2b (do-not-cut per the build spec): a RESOLVER reply outside WhatsApp's 24hr
    // customer-service window must go out as an approved TEMPLATE — Meta rejects a
    // FREETEXT send otherwise. Forced here regardless of what the caller requested;
    // USER/SYSTEM messages aren't subject to the window (only outbound-to-user sends are).
    const outsideWindow =
      !ticket.lastInboundAt || Date.now() - ticket.lastInboundAt.getTime() > WHATSAPP_WINDOW_MS;
    const effectiveChannelType =
      senderType === "RESOLVER" && outsideWindow ? "TEMPLATE" : channelType ?? "FREETEXT";

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          ticketId: ticket.id,
          senderType,
          body,
          channelType: effectiveChannelType,
        },
      });

      const updateData: Record<string, unknown> = {};
      if (senderType === "USER") {
        updateData.lastInboundAt = new Date();
      }
      if (senderType === "RESOLVER" && (ticket.status === "NEW" || ticket.status === "ASSIGNED")) {
        updateData.status = "IN_PROGRESS";
      } else if (senderType === "USER" && ticket.status === "AWAITING_CUSTOMER") {
        updateData.status = "NEEDS_RESOLVER_INPUT";
      }

      if (Object.keys(updateData).length > 0) {
        await tx.ticket.update({ where: { id: ticket.id }, data: updateData });
      }
      if (typeof updateData.status === "string") {
        await tx.auditLog.create({
          data: {
            ticketId: ticket.id,
            actor: senderType === "RESOLVER" ? "resolver" : "user",
            action: "STATUS_CHANGED",
            fromValue: ticket.status,
            toValue: updateData.status,
          },
        });
      }

      return created;
    });

    res.status(201).json(message);
  })
);

// POST /api/tickets/:id/escalate — manual escalation, writes AuditLog.escalationTrigger =
// MANUAL to distinguish from the (not-yet-built) TAT-breach scheduler's AUTO_TAT_BREACH.
ticketsRouter.post(
  "/tickets/:id/escalate",
  asyncHandler(async (req, res) => {
    const { actor, reason } = req.body ?? {};
    if (!actor) throw new HttpError(400, "actor is required");

    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw new HttpError(404, "Ticket not found");

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: "ESCALATED" },
      });
      await tx.auditLog.create({
        data: {
          ticketId: ticket.id,
          actor,
          action: "ESCALATED",
          fromValue: ticket.status,
          toValue: reason ? `ESCALATED: ${reason}` : "ESCALATED",
          escalationTrigger: "MANUAL",
        },
      });
      return result;
    });

    res.json(updated);
  })
);

// POST /api/tickets/:id/attachments — record an already-uploaded file against a ticket.
// Attachment.messageId is required by the schema; when the caller doesn't supply one
// (a standalone attach, not tied to a specific reply), a synthetic SYSTEM message is
// created to own it, per the schema's own comment on Attachment.messageId.
ticketsRouter.post(
  "/tickets/:id/attachments",
  asyncHandler(async (req, res) => {
    const { fileUrl, uploadedBy, messageId } = req.body ?? {};
    if (!fileUrl || !uploadedBy) throw new HttpError(400, "fileUrl and uploadedBy are required");

    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw new HttpError(404, "Ticket not found");

    if (messageId) {
      const message = await prisma.message.findUnique({ where: { id: messageId } });
      if (!message || message.ticketId !== ticket.id) {
        throw new HttpError(400, "messageId must belong to this ticket");
      }
    }

    const attachment = await prisma.$transaction(async (tx) => {
      const ownerMessageId =
        messageId ??
        (
          await tx.message.create({
            data: {
              ticketId: ticket.id,
              senderType: "SYSTEM",
              body: `Attachment added: ${fileUrl}`,
              channelType: "FREETEXT",
            },
          })
        ).id;

      const created = await tx.attachment.create({
        data: {
          ticketId: ticket.id,
          messageId: ownerMessageId,
          fileUrl,
          uploadedBy,
        },
      });

      await tx.auditLog.create({
        data: {
          ticketId: ticket.id,
          actor: uploadedBy,
          action: "ATTACHMENT_ADDED",
          toValue: fileUrl,
        },
      });

      return created;
    });

    res.status(201).json(attachment);
  })
);
