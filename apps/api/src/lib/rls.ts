import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

export type RlsTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

// Runs `fn` inside a transaction with the Postgres session variables the RLS policies
// (packages/db/prisma/migrations/.../add_row_level_security) key off of set via
// `SET LOCAL` — SET isn't parameterizable directly, so this goes through
// `set_config(name, value, true)` instead, which is (avoids any injection risk from
// teamId, even though it's always server-derived from a verified JWT, never raw
// user input).
export async function withRlsContext<T>(
  ctx: { teamId: string; isAdmin: boolean },
  fn: (tx: RlsTx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_team_id', ${ctx.teamId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_admin', ${ctx.isAdmin ? "true" : "false"}, true)`;
    return fn(tx);
  });
}

// System/citizen-facing routes (ticket creation, the public category tree, the webform
// identity read) have no resolver session — they run with the RLS bypass, same as an
// admin, since they were never scoped to a team in the first place.
export function withSystemRls<T>(fn: (tx: RlsTx) => Promise<T>): Promise<T> {
  return withRlsContext({ teamId: "", isAdmin: true }, fn);
}
