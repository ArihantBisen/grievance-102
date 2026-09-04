import { Router } from "express";
import type { Role, TicketStatus, TicketType } from "@prisma/client";
import { formatTicketNumber } from "@sboss/shared-types";
import { asyncHandler, HttpError } from "../lib/asyncHandler";
import { withRlsContext, withSystemRls } from "../lib/rls";
import { requireAuth } from "../middleware/auth";

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
  "REOPENED",
];

// Formats the confirmation a citizen receives the moment a ticket is raised. Kept as
// plain labelled lines with WhatsApp's *bold* markup — the same content the escalation
// email lays out as an HTML card, in the only formatting WhatsApp actually renders.
function formatStamp(date: Date): string {
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildTicketCard(input: {
  reference: string;
  identityName: string;
  ticketType: TicketType;
  categoryName: string;
  subcategoryName: string;
  createdAt: Date;
  tatDueAt: Date;
}): string {
  const heading = input.ticketType === "REQUEST" ? "Request Registered" : "Grievance Registered";
  return [
    `*${heading}*`,
    "",
    `Dear ${input.identityName.split(" ")[0]}, your ${
      input.ticketType === "REQUEST" ? "request" : "grievance"
    } has been logged in the SBOSS Grievance Portal.`,
    "",
    `*Reference:* ${input.reference}`,
    `*Logged on:* ${formatStamp(input.createdAt)}`,
    `*Category:* ${input.categoryName}`,
    `*Sub-category:* ${input.subcategoryName}`,
    `*Status:* New`,
    `*Response due by:* ${formatStamp(input.tatDueAt)}`,
    "",
    `We'll update you here as it progresses. Reply *status* any time to check where things stand.`,
  ].join("\n");
}

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
// Citizen-facing (WhatsApp/website intake) — no resolver session exists here, so this
// runs with the RLS bypass (withSystemRls), same as every other citizen route.
// identityId is caller-supplied for now — real caller-identity resolution (from a JWT
// or an authenticated WhatsApp/webform session) arrives with the still-unbuilt
// signed-link auth (ADR-002); this endpoint was never meant to require a resolver login.
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

    const ticket = await withSystemRls(async (tx) => {
      const identity = await tx.identity.findUnique({ where: { id: identityId } });
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

      const subcategory = await tx.subcategory.findUnique({
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

      // Same-day duplicate lock: one ticket per identity per subcategory per calendar
      // day. Stops the same complaint being filed repeatedly from the menu (the common
      // case being a citizen re-walking the form because they didn't see the first
      // confirmation), which otherwise fragments one issue across several tickets and
      // makes the multi-ticket disambiguation prompt fire needlessly. Scoped to the
      // subcategory, not the category, so genuinely different issues under one category
      // are still allowed on the same day.
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const sameDayDuplicate = await tx.ticket.findFirst({
        where: { identityId, subcategoryId, createdAt: { gte: startOfDay } },
        select: { id: true, ticketNumber: true },
      });
      if (sameDayDuplicate) {
        throw new HttpError(
          409,
          `You've already raised a ticket under "${subcategory.name}" today (reference ${
            sameDayDuplicate.ticketNumber ?? sameDayDuplicate.id.slice(-8)
          }). Reply on that ticket instead of raising a new one, or pick a different sub-category.`
        );
      }

      const tatHours = subcategory.tatHoursOverride ?? subcategory.category.defaultTatHours;
      const tatDueAt = new Date(Date.now() + tatHours * 60 * 60 * 1000);
      const now = new Date();

      // Global ticket number ("#IT-00001") — grievances only, for now (REQUEST tickets
      // stay unnumbered; every downstream display/matching site falls back to the cuid
      // suffix when ticketNumber is null). Claiming the next number is a single atomic
      // UPDATE ... RETURNING on the one TicketSequence row, inside this same
      // transaction — under Postgres row locking, two concurrent ticket creations
      // serialize on that row and can never receive the same number, and a rolled-back
      // creation rolls the increment back with it (no gaps).
      let ticketNumber: string | undefined;
      if (requestedType === "GRIEVANCE") {
        const seq = await tx.ticketSequence.update({
          where: { id: 1 },
          data: { counter: { increment: 1 } },
        });
        const department = await tx.department.findUniqueOrThrow({
          where: { id: subcategory.category.departmentId },
          select: { prefix: true },
        });
        ticketNumber = formatTicketNumber(department.prefix, seq.counter);
      }

      const created = await tx.ticket.create({
        data: {
          ticketNumber,
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
          data: { ticketId: created.id, senderType: "USER", body, channelType: "FREETEXT" },
        });
      }

      // Outbound confirmation ("WhatsApp ticket card" + email, per spec A1). This is a
      // SYSTEM message left PENDING for the Outbox Worker to actually dispatch —
      // Message.deliveryStatus is the outbox queue (no separate OutboxEvent table
      // exists in the schema; this is the queue signal the worker polls on).
      //
      // Formatted as a ticket card using WhatsApp's own markup (*bold*) rather than
      // the rich HTML the email template uses — WhatsApp renders no HTML, colours, or
      // layout, so the card has to be carried by labelled lines and bold weight alone.
      // The reference shown is the same value the webhook's "status" and multi-ticket
      // flows accept back, so what the citizen is shown is exactly what they can reply
      // with — the real ticket number for a grievance, or the old cuid suffix for a
      // not-yet-numbered request.
      await tx.message.create({
        data: {
          ticketId: created.id,
          senderType: "SYSTEM",
          body: buildTicketCard({
            reference: created.ticketNumber ?? created.id.slice(-8),
            identityName: identity.name,
            ticketType: requestedType,
            categoryName: subcategory.category.name,
            subcategoryName: subcategory.name,
            createdAt: now,
            tatDueAt,
          }),
          // FREETEXT regardless of which channel the ticket was filed through. The
          // channel a ticket came in on says nothing about whether WhatsApp's 24hr
          // customer-service window is open — and it almost always is here, since the
          // citizen texted in to get the submission link moments earlier (ticket
          // creation stamps lastInboundAt = now, just above). Marking this TEMPLATE
          // because channel === "WEB" meant every web-form confirmation went out as an
          // approved-template send referencing `sboss_ticket_update`, which has never
          // been submitted to Meta — so Meta rejected it and the requester silently got
          // no confirmation at all. The Outbox Worker re-checks the window at dispatch
          // time and upgrades to TEMPLATE by itself if it has genuinely closed, which is
          // the only thing that should decide this.
          channelType: "FREETEXT",
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

// GET /api/tickets — resolver/admin queue. Team scoping is enforced by Postgres RLS
// (withRlsContext), not just this ?teamId filter — a non-admin's rows are restricted
// to their own team regardless of what teamId they pass; the filter mainly lets an
// admin narrow which team's queue they're looking at.
ticketsRouter.get(
  "/tickets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { teamId, status, ticketType, identityId } = req.query as Record<string, string | undefined>;
    const auth = req.auth!;

    const tickets = await withRlsContext({ teamId: auth.teamId, isAdmin: auth.isAdmin }, (tx) =>
      tx.ticket.findMany({
        where: {
          teamId: teamId || undefined,
          status: (status as TicketStatus) || undefined,
          ticketType: (ticketType as TicketType) || undefined,
          identityId: identityId || undefined,
        },
        orderBy: { createdAt: "desc" },
        include: TICKET_LIST_INCLUDE,
      })
    );

    res.json(tickets);
  })
);

// GET /api/tickets/mine?identityId=&openOnly= — caller's own tickets. Citizen-facing
// (backs multi-ticket disambiguation and the WhatsApp status-check, ADR-002 action item
// 2) — no resolver session, runs with the RLS bypass like ticket creation.
ticketsRouter.get(
  "/tickets/mine",
  asyncHandler(async (req, res) => {
    const { identityId, openOnly } = req.query as Record<string, string | undefined>;
    if (!identityId) throw new HttpError(400, "identityId is required");

    const tickets = await withSystemRls((tx) =>
      tx.ticket.findMany({
        where: {
          identityId,
          status: openOnly === "true" ? { in: OPEN_STATUSES } : undefined,
        },
        orderBy: { createdAt: "desc" },
        include: TICKET_LIST_INCLUDE,
      })
    );

    res.json(tickets);
  })
);

// GET /api/tickets/summary — status counts for the resolver's own queue dashboard.
// Team-scoped by RLS exactly like GET /tickets, so the numbers on a resolver's tiles
// always match the rows they can actually open. Buckets, not raw statuses: the console
// shows New / In Progress / Closed / Reopened, and everything mid-flight (assigned,
// awaiting customer, escalated, reassigned…) reads as "in progress" to a resolver.
//
// MUST stay above GET /tickets/:id — Express matches in registration order, and
// "/tickets/:id" happily swallows "/tickets/summary" with id = "summary" otherwise.
const IN_PROGRESS_STATUSES: TicketStatus[] = [
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CUSTOMER",
  "NEEDS_RESOLVER_INPUT",
  "ESCALATED",
  "REASSIGNED",
];

ticketsRouter.get(
  "/tickets/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const summary = await withRlsContext({ teamId: auth.teamId, isAdmin: auth.isAdmin }, async (tx) => {
      const [neu, inProgress, closed, reopened, breached] = await Promise.all([
        tx.ticket.count({ where: { status: "NEW" } }),
        tx.ticket.count({ where: { status: { in: IN_PROGRESS_STATUSES } } }),
        tx.ticket.count({ where: { status: { in: ["RESOLVED", "CLOSED"] } } }),
        tx.ticket.count({ where: { status: "REOPENED" } }),
        tx.ticket.count({ where: { breached: true, status: { in: OPEN_STATUSES } } }),
      ]);
      return { new: neu, inProgress, closed, reopened, breached };
    });

    res.json(summary);
  })
);

// GET /api/tickets/:id — ticket detail + thread. RLS makes a cross-team ticket 404
// rather than 403 — it's simply not a row the caller's session can see, which avoids
// confirming a ticket ID exists to someone who can't access it.
ticketsRouter.get(
  "/tickets/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const ticket = await withRlsContext({ teamId: auth.teamId, isAdmin: auth.isAdmin }, (tx) =>
      tx.ticket.findUnique({ where: { id: req.params.id }, include: TICKET_DETAIL_INCLUDE })
    );
    if (!ticket) throw new HttpError(404, "Ticket not found");
    res.json(ticket);
  })
);

// PATCH /api/tickets/:id — update (status, teamId for reassignment, resolverId claim,
// priority). actor is derived from the authenticated session, not client-supplied —
// trusting a body-supplied actor would let anyone attribute audit entries to anyone else.
ticketsRouter.patch(
  "/tickets/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, teamId, resolverId, priority } = req.body ?? {};
    const auth = req.auth!;
    const actor = auth.email;

    const ticket = await withRlsContext({ teamId: auth.teamId, isAdmin: auth.isAdmin }, async (tx) => {
      const existing = await tx.ticket.findUnique({ where: { id: req.params.id } });
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

      if (Object.keys(data).length === 0) return existing;

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
// window / template-fallback check (schema comment on Ticket.lastInboundAt). senderType
// is still caller-supplied (a resolver reply always sends RESOLVER; USER/SYSTEM replies
// come from the citizen-facing paths, which don't carry a resolver session) — but this
// route itself requires resolver auth, since only the console posts to it today.
ticketsRouter.post(
  "/tickets/:id/reply",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { senderType, body, channelType } = req.body ?? {};
    if (!senderType || !body) throw new HttpError(400, "senderType and body are required");
    const auth = req.auth!;

    const message = await withRlsContext({ teamId: auth.teamId, isAdmin: auth.isAdmin }, async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: req.params.id } });
      if (!ticket) throw new HttpError(404, "Ticket not found");

      // D2/D2b (do-not-cut per the build spec): a RESOLVER reply outside WhatsApp's
      // 24hr customer-service window must go out as an approved TEMPLATE — Meta rejects
      // a FREETEXT send otherwise. Forced here regardless of what the caller requested.
      const outsideWindow =
        !ticket.lastInboundAt || Date.now() - ticket.lastInboundAt.getTime() > WHATSAPP_WINDOW_MS;
      const effectiveChannelType =
        senderType === "RESOLVER" && outsideWindow ? "TEMPLATE" : channelType ?? "FREETEXT";

      const created = await tx.message.create({
        data: { ticketId: ticket.id, senderType, body, channelType: effectiveChannelType },
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
            actor: senderType === "RESOLVER" ? auth.email : "user",
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

// POST /api/tickets/bulk-close — close several tickets at once with one shared reason.
// Resolver-facing (team-scoped by RLS, unlike the admin router's filter-driven variant),
// and the reason is mandatory: closing without saying how it was resolved is exactly the
// gap that makes a closed ticket useless to the next person reading it. The reason is
// also written into each ticket's thread as a RESOLVER message, so it goes out to the
// requester over WhatsApp through the normal Outbox path rather than only being filed.
ticketsRouter.post(
  "/tickets/bulk-close",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { ticketIds, reason } = req.body ?? {};
    const auth = req.auth!;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      throw new HttpError(400, "ticketIds must be a non-empty array");
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      throw new HttpError(400, "reason is required — say how these tickets were resolved");
    }
    const closureReason = reason.trim();

    const closed = await withRlsContext({ teamId: auth.teamId, isAdmin: auth.isAdmin }, async (tx) => {
      // RLS silently filters out anything outside the caller's team, so this findMany is
      // also the authorisation check — ids the resolver may not touch simply don't come
      // back, and are reported as skipped rather than closed.
      const targets = await tx.ticket.findMany({
        where: { id: { in: ticketIds as string[] }, status: { in: OPEN_STATUSES } },
        select: { id: true, status: true, lastInboundAt: true },
      });
      if (targets.length === 0) return [];

      const now = new Date();
      await tx.ticket.updateMany({
        where: { id: { in: targets.map((t) => t.id) } },
        data: { status: "CLOSED", resolvedAt: now, closureReason },
      });

      // Same 24hr-window rule the single reply path applies (D2/D2b): outside it, the
      // send has to go as an approved TEMPLATE or Meta rejects it.
      await tx.message.createMany({
        data: targets.map((t) => ({
          ticketId: t.id,
          senderType: "RESOLVER" as const,
          body: `Your ticket has been resolved and closed.\n\n*Resolution:* ${closureReason}`,
          channelType:
            !t.lastInboundAt || Date.now() - t.lastInboundAt.getTime() > WHATSAPP_WINDOW_MS
              ? ("TEMPLATE" as const)
              : ("FREETEXT" as const),
        })),
      });

      await tx.auditLog.createMany({
        data: targets.map((t) => ({
          ticketId: t.id,
          actor: auth.email,
          action: "STATUS_CHANGED",
          fromValue: t.status,
          toValue: `CLOSED: ${closureReason}`,
        })),
      });

      return targets.map((t) => t.id);
    });

    res.json({
      closedCount: closed.length,
      skippedCount: ticketIds.length - closed.length,
      ticketIds: closed,
    });
  })
);

// POST /api/tickets/:id/reopen — pull a resolved/closed ticket back open.
// Bounded deliberately: only within REOPEN_WINDOW_DAYS of the resolution, and only
// REOPEN_LIMIT times, so a closed ticket can't be reopened indefinitely to dodge the
// TAT clock. Past either bound the requester has to raise a fresh ticket, which is the
// honest outcome — a months-old thread reopened for a new problem is a new problem.
const REOPEN_WINDOW_DAYS = 3;
const REOPEN_LIMIT = 2;

ticketsRouter.post(
  "/tickets/:id/reopen",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reason } = req.body ?? {};
    const auth = req.auth!;

    const updated = await withRlsContext({ teamId: auth.teamId, isAdmin: auth.isAdmin }, async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: req.params.id } });
      if (!ticket) throw new HttpError(404, "Ticket not found");

      if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") {
        throw new HttpError(400, "Only a resolved or closed ticket can be reopened");
      }
      if (!ticket.resolvedAt) {
        throw new HttpError(400, "This ticket has no resolution date to reopen against");
      }

      const windowMs = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const ageMs = Date.now() - ticket.resolvedAt.getTime();
      if (ageMs > windowMs) {
        throw new HttpError(
          400,
          `This ticket was resolved more than ${REOPEN_WINDOW_DAYS} days ago and can no longer be reopened — please raise a new ticket.`
        );
      }
      if (ticket.reopenCount >= REOPEN_LIMIT) {
        throw new HttpError(
          400,
          `This ticket has already been reopened ${REOPEN_LIMIT} times — please raise a new ticket.`
        );
      }

      const now = new Date();
      const result = await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "REOPENED",
          reopenCount: { increment: 1 },
          lastReopenedAt: now,
        },
      });

      await tx.message.create({
        data: {
          ticketId: ticket.id,
          senderType: "SYSTEM",
          body: reason
            ? `This ticket has been reopened.\n\n*Reason:* ${String(reason).trim()}`
            : "This ticket has been reopened and is being looked at again.",
          channelType:
            !ticket.lastInboundAt || Date.now() - ticket.lastInboundAt.getTime() > WHATSAPP_WINDOW_MS
              ? "TEMPLATE"
              : "FREETEXT",
        },
      });

      await tx.auditLog.create({
        data: {
          ticketId: ticket.id,
          actor: auth.email,
          action: "STATUS_CHANGED",
          fromValue: ticket.status,
          toValue: reason ? `REOPENED: ${String(reason).trim()}` : "REOPENED",
        },
      });

      return result;
    });

    res.json(updated);
  })
);

// POST /api/tickets/:id/escalate — manual escalation, writes AuditLog.escalationTrigger =
// MANUAL to distinguish from the (not-yet-built) TAT-breach scheduler's AUTO_TAT_BREACH.
// actor is derived from the session, same reasoning as PATCH above.
ticketsRouter.post(
  "/tickets/:id/escalate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reason } = req.body ?? {};
    const auth = req.auth!;

    const updated = await withRlsContext({ teamId: auth.teamId, isAdmin: auth.isAdmin }, async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: req.params.id } });
      if (!ticket) throw new HttpError(404, "Ticket not found");

      const result = await tx.ticket.update({ where: { id: ticket.id }, data: { status: "ESCALATED" } });
      await tx.auditLog.create({
        data: {
          ticketId: ticket.id,
          actor: auth.email,
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
// Citizen-facing, like ticket creation: the website posts here immediately after
// creating a ticket (no resolver session exists at that point), so this stays on the
// RLS bypass rather than requireAuth. uploadedBy is caller-supplied (the identityId or
// resolver email posting it) until real caller-identity resolution exists.
// Attachment.messageId is required by the schema; when the caller doesn't supply one
// (a standalone attach, not tied to a specific reply), a synthetic SYSTEM message is
// created to own it, per the schema's own comment on Attachment.messageId.
ticketsRouter.post(
  "/tickets/:id/attachments",
  asyncHandler(async (req, res) => {
    const { fileUrl, uploadedBy, messageId } = req.body ?? {};
    if (!fileUrl || !uploadedBy) throw new HttpError(400, "fileUrl and uploadedBy are required");

    const attachment = await withSystemRls(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: req.params.id } });
      if (!ticket) throw new HttpError(404, "Ticket not found");

      if (messageId) {
        const message = await tx.message.findUnique({ where: { id: messageId } });
        if (!message || message.ticketId !== ticket.id) {
          throw new HttpError(400, "messageId must belong to this ticket");
        }
      }

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
        data: { ticketId: ticket.id, messageId: ownerMessageId, fileUrl, uploadedBy },
      });

      await tx.auditLog.create({
        data: { ticketId: ticket.id, actor: uploadedBy, action: "ATTACHMENT_ADDED", toValue: fileUrl },
      });

      return created;
    });

    res.status(201).json(attachment);
  })
);
