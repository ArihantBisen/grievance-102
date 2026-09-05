import { Router } from "express";
import type { EmploymentStatus, Role, TicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { withRlsContext, type RlsTx } from "../lib/rls";
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
  "REOPENED",
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

// POST /api/admin/tickets/bulk-close — close every currently-open ticket matching the
// given filters in one request, or an explicit list of ticket IDs. Built for the
// recurring need to clear a test identity's accumulated open tickets in one shot
// instead of hand-editing the DB; each closed ticket still gets its own AuditLog entry
// (fromValue = that ticket's own prior status) so the trail reads the same as any
// individual close would.
adminRouter.post(
  "/tickets/bulk-close",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { ticketIds, identityId, teamId, olderThanHours, targetStatus } = req.body ?? {};
    const finalStatus: TicketStatus = targetStatus === "RESOLVED" ? "RESOLVED" : "CLOSED";

    const closedIds = await withRlsContext({ teamId: auth.teamId, isAdmin: true }, async (tx) => {
      const where =
        Array.isArray(ticketIds) && ticketIds.length > 0
          ? { id: { in: ticketIds as string[] } }
          : {
              status: { in: OPEN_STATUSES },
              identityId: identityId || undefined,
              teamId: teamId || undefined,
              createdAt: olderThanHours
                ? { lt: new Date(Date.now() - Number(olderThanHours) * 60 * 60 * 1000) }
                : undefined,
            };

      const targets = await tx.ticket.findMany({ where, select: { id: true, status: true } });
      if (targets.length === 0) return [];

      const now = new Date();
      await tx.ticket.updateMany({
        where: { id: { in: targets.map((t) => t.id) } },
        data: { status: finalStatus, resolvedAt: now },
      });
      await tx.auditLog.createMany({
        data: targets.map((t) => ({
          ticketId: t.id,
          actor: auth.email,
          action: "STATUS_CHANGED",
          fromValue: t.status,
          toValue: finalStatus,
        })),
      });
      return targets.map((t) => t.id);
    });

    res.json({ closedCount: closedIds.length, ticketIds: closedIds });
  })
);

// GET /api/admin/reports/summary — MIS-style aggregate view: ticket volume, TAT
// performance, team/category breakdown, resolver workload. Deliberately computed with
// plain groupBy + in-process sorting/averaging rather than raw SQL, since the volumes
// here (dev/demo scale) don't need DB-side aggregation to stay fast, and it keeps this
// route as unexciting as every other admin route to review.
// Shared shape for both the current-period and (optional) previous-period halves of
// GET /reports/summary — see the route below for how the two are computed and combined.
interface ReportFilterInput {
  categoryId?: string;
  subcategoryId?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date;
}

async function computeReportSummary(tx: RlsTx, filters: ReportFilterInput) {
  // Base filter every query below extends — undefined fields are simply omitted by
  // Prisma, so an unfiltered call (the "all time, no filters" case, unchanged from
  // before this feature) behaves exactly as it did.
  const base = {
    categoryId: filters.categoryId || undefined,
    subcategoryId: filters.subcategoryId || undefined,
    createdAt:
      filters.createdAtFrom || filters.createdAtTo
        ? { gte: filters.createdAtFrom, lte: filters.createdAtTo }
        : undefined,
  };

  const [
    totalAll,
    totalOpen,
    totalBreached,
    statusCounts,
    teams,
    totalsByTeam,
    openByTeam,
    resolvedDurations,
    resolvers,
    openByResolver,
    categories,
    countsByCategory,
  ] = await Promise.all([
    tx.ticket.count({ where: base }),
    tx.ticket.count({ where: { ...base, status: { in: OPEN_STATUSES } } }),
    tx.ticket.count({ where: { ...base, breached: true } }),
    tx.ticket.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    tx.team.findMany({ select: { id: true, name: true } }),
    tx.ticket.groupBy({ by: ["teamId"], where: base, _count: { _all: true } }),
    tx.ticket.groupBy({
      by: ["teamId"],
      where: { ...base, status: { in: OPEN_STATUSES } },
      _count: { _all: true },
    }),
    tx.ticket.findMany({
      where: { ...base, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
      take: 2000,
    }),
    tx.resolver.findMany({ select: { id: true, name: true } }),
    tx.ticket.groupBy({
      by: ["resolverId"],
      where: { ...base, resolverId: { not: null }, status: { in: OPEN_STATUSES } },
      _count: { _all: true },
    }),
    tx.category.findMany({ select: { id: true, name: true } }),
    tx.ticket.groupBy({ by: ["categoryId"], where: base, _count: { _all: true } }),
  ]);

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const openByTeamId = new Map(openByTeam.map((r) => [r.teamId, r._count._all]));
  const byTeam = totalsByTeam
    .map((r) => ({
      teamId: r.teamId,
      teamName: teamNameById.get(r.teamId) ?? "(unknown team)",
      totalCount: r._count._all,
      openCount: openByTeamId.get(r.teamId) ?? 0,
    }))
    .sort((a, b) => b.totalCount - a.totalCount);

  const resolverNameById = new Map(resolvers.map((r) => [r.id, r.name]));
  const resolverWorkload = openByResolver
    .map((r) => ({
      resolverId: r.resolverId as string,
      resolverName: resolverNameById.get(r.resolverId as string) ?? "(unknown resolver)",
      openCount: r._count._all,
    }))
    .sort((a, b) => b.openCount - a.openCount);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = countsByCategory
    .map((r) => ({
      categoryId: r.categoryId,
      categoryName: categoryNameById.get(r.categoryId) ?? "(unknown category)",
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const resolutionHours = resolvedDurations.map(
    (t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3_600_000
  );
  const avgResolutionHours =
    resolutionHours.length > 0
      ? resolutionHours.reduce((sum, h) => sum + h, 0) / resolutionHours.length
      : null;

  return {
    totals: { all: totalAll, open: totalOpen, breached: totalBreached },
    breachRate: totalAll > 0 ? totalBreached / totalAll : 0,
    avgResolutionHours,
    byStatus: statusCounts.map((r) => ({ status: r.status, count: r._count._all })),
    byTeam,
    byCategory,
    resolverWorkload,
  };
}

// GET /api/admin/reports/summary?categoryId=&subcategoryId=&dateFrom=&dateTo=&compare=true
// — configurable MIS view. With no query params this is exactly the all-time summary
// the Reports tab has always shown. Filtering to a date range and passing compare=true
// additionally computes the immediately preceding period of equal length (e.g.
// filtering the last 7 days also computes the 7 days before that), so "current vs
// older data" has a well-defined meaning — there's no sensible "previous" for an
// unbounded all-time view, so that case always returns previous: null.
adminRouter.get(
  "/reports/summary",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { categoryId, subcategoryId, dateFrom, dateTo, compare } = req.query as Record<
      string,
      string | undefined
    >;

    const createdAtFrom = dateFrom ? new Date(dateFrom) : undefined;
    const createdAtTo = dateTo ? new Date(dateTo) : undefined;
    if (createdAtTo) {
      // Query params are day-granularity ("2026-09-04"), which Date parses as that
      // day's UTC midnight — extend to the end of that day so the filter includes the
      // whole day the citizen picked, not zero seconds of it.
      createdAtTo.setUTCHours(23, 59, 59, 999);
    }
    if ((createdAtFrom && isNaN(createdAtFrom.getTime())) || (createdAtTo && isNaN(createdAtTo.getTime()))) {
      throw new HttpError(400, "dateFrom/dateTo must be valid dates");
    }

    const result = await withRlsContext({ teamId: auth.teamId, isAdmin: true }, async (tx) => {
      const current = await computeReportSummary(tx, { categoryId, subcategoryId, createdAtFrom, createdAtTo });

      let previous: Awaited<ReturnType<typeof computeReportSummary>> | null = null;
      if (compare === "true" && createdAtFrom && createdAtTo) {
        const periodMs = createdAtTo.getTime() - createdAtFrom.getTime();
        const prevTo = new Date(createdAtFrom.getTime() - 1); // end right before the current period starts
        const prevFrom = new Date(prevTo.getTime() - periodMs);
        previous = await computeReportSummary(tx, {
          categoryId,
          subcategoryId,
          createdAtFrom: prevFrom,
          createdAtTo: prevTo,
        });
      }

      return { current, previous, filters: { categoryId, subcategoryId, dateFrom, dateTo, compare: compare === "true" } };
    });

    res.json(result);
  })
);
