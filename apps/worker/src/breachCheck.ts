import { getPrismaClient, type TicketStatus } from "@sboss/db";

const prisma = getPrismaClient();

// Tickets in these statuses are still "open" for TAT purposes — a resolved/closed
// ticket's due date no longer matters, and an already-ESCALATED ticket has nothing
// further to auto-escalate into.
const BREACHABLE_STATUSES: TicketStatus[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CUSTOMER",
  "NEEDS_RESOLVER_INPUT",
  "REASSIGNED",
  "REOPENED",
];

export async function checkTatBreaches(): Promise<{ breached: number }> {
  // Same RLS admin-bypass every system process needs (see dispatch.ts's comment on
  // why this can't be skipped — silently-empty results, not an error, if it is).
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_team_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.is_admin', 'true', true)`;

    const overdue = await tx.ticket.findMany({
      where: {
        breached: false,
        status: { in: BREACHABLE_STATUSES },
        tatDueAt: { lt: new Date() },
      },
      take: 100,
    });

    for (const ticket of overdue) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { breached: true, status: "ESCALATED" },
      });

      await tx.auditLog.create({
        data: {
          ticketId: ticket.id,
          actor: "system",
          action: "ESCALATED",
          fromValue: ticket.status,
          toValue: "ESCALATED: TAT breached",
          escalationTrigger: "AUTO_TAT_BREACH",
        },
      });

      // Reuses the existing Outbox path rather than a second notification mechanism —
      // this becomes a normal PENDING SYSTEM message the dispatch loop picks up.
      await tx.message.create({
        data: {
          ticketId: ticket.id,
          senderType: "SYSTEM",
          body: `Ticket ${ticket.id} has breached its TAT and has been escalated. We're on it.`,
          channelType: "FREETEXT",
        },
      });
    }

    return { breached: overdue.length };
  });
}
