import { Router } from "express";
import type { EmploymentStatus, Role, TicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { withRlsContext } from "../lib/rls";
import { asyncHandler, HttpError } from "../lib/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";

// Mounted at /api/admin (see app.ts) — NOT /api — specifically so this router's blanket
// requireAuth/requireAdmin only ever gates its own routes. Mounting it at /api instead
// would make Express run this middleware for any /api/* request that fell through
// every earlier router unmatched (including ones meant for routers registered after
// it, like the webhook receiver) — that exact bug happened once already.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const OPEN_STATUSES: TicketStatus[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CUSTOMER",
  "NEEDS_RESOLVER_INPUT",
  "ESCALATED",
  "REASSIGNED",
];

// GET /api/admin/identities?role=&employmentStatus=&search= — spec D2.
adminRouter.get(
  "/identities",
  asyncHandler(async (req, res) => {
    const { role, employmentStatus, search } = req.query as Record<string, string | undefined>;
    const identities = await prisma.identity.findMany({
      where: {
        role: (role as Role) || undefined,
        employmentStatus: (employmentStatus as EmploymentStatus) || undefined,
        name: search ? { contains: search, mode: "insensitive" } : undefined,
      },
      orderBy: { name: "asc" },
      take: 200,
    });
    res.json(identities);
  })
);

// PATCH /api/admin/identities/:id/role — manual role override (spec D2). Preserved
// across subsequent Workline syncs by marking roleClassifiedBy = "admin" (D2a): the
// sync job checks this before reclassifying from designation.
adminRouter.patch(
  "/identities/:id/role",
  asyncHandler(async (req, res) => {
    const { role } = req.body ?? {};
    if (!role) throw new HttpError(400, "role is required");

    const identity = await prisma.identity.update({
      where: { id: req.params.id },
      data: { role, roleClassifiedBy: "admin" },
    });
    res.json(identity);
  })
);

// GET /api/admin/unknown-contacts?reviewed= — ADR-011's periodic-review log.
adminRouter.get(
  "/unknown-contacts",
  asyncHandler(async (req, res) => {
    const { reviewed } = req.query as Record<string, string | undefined>;
    const contacts = await prisma.unknownContact.findMany({
      where: { reviewed: reviewed === undefined ? undefined : reviewed === "true" },
      orderBy: { lastSeenAt: "desc" },
    });
    res.json(contacts);
  })
);

// PATCH /api/admin/unknown-contacts/:id — mark reviewed (ADR-011).
adminRouter.patch(
  "/unknown-contacts/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const contact = await prisma.unknownContact.update({
      where: { id: req.params.id },
      data: { reviewed: true, reviewedBy: auth.email, reviewedAt: new Date() },
    });
    res.json(contact);
  })
);

// GET /api/admin/orphaned-tickets — open tickets whose owner is INACTIVE (ADR-010's
// supervisor-review queue). Ticket is RLS-protected, so this reads through
// withRlsContext with the admin bypass — an admin route is exactly the intended use of
// that bypass, not a workaround of it.
adminRouter.get(
  "/orphaned-tickets",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const tickets = await withRlsContext({ teamId: auth.teamId, isAdmin: true }, (tx) =>
      tx.ticket.findMany({
        where: {
          status: { in: OPEN_STATUSES },
          identity: { employmentStatus: "INACTIVE" },
        },
        orderBy: { createdAt: "asc" },
        include: { identity: true, category: true, subcategory: true, team: true },
      })
    );
    res.json(tickets);
  })
);

// GET /api/admin/sync-runs — SyncRun history (spec D2). Empty until the Workline sync
// job (D2a) exists — this just reads whatever's there.
adminRouter.get(
  "/sync-runs",
  asyncHandler(async (_req, res) => {
    const runs = await prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
    res.json(runs);
  })
);

// GET /api/admin/metrics — spec A4's "Phase 1 minimum" monitoring: webhook uptime,
// Outbox Worker queue depth, breached-ticket count, failed-dispatch count. Ticket/
// Message are RLS-protected, so those two counts go through withRlsContext's admin
// bypass; InboundMessageDedup/uptime aren't RLS-protected (system-only tables/values).
adminRouter.get(
  "/metrics",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const [lastInbound, counts] = await Promise.all([
      prisma.inboundMessageDedup.findFirst({ orderBy: { receivedAt: "desc" } }),
      withRlsContext({ teamId: auth.teamId, isAdmin: true }, async (tx) => {
        const [outboxQueueDepth, failedDispatchCount, breachedTicketCount] = await Promise.all([
          tx.message.count({ where: { deliveryStatus: "PENDING" } }),
          tx.message.count({ where: { deliveryStatus: "FAILED" } }),
          tx.ticket.count({ where: { breached: true, status: { in: OPEN_STATUSES } } }),
        ]);
        return { outboxQueueDepth, failedDispatchCount, breachedTicketCount };
      }),
    ]);

    res.json({
      apiUptimeSeconds: Math.round(process.uptime()),
      lastInboundWebhookAt: lastInbound?.receivedAt ?? null,
      ...counts,
    });
  })
);
