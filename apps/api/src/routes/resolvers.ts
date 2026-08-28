import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";

export const resolversRouter = Router();

// GET /api/resolvers?teamId= — list resolvers, optionally scoped to a team. Backs the
// Resolver Console's claim dropdown and "acting as" selector; not in the spec's D2 list
// but needed now since JWT auth (which would derive the acting resolver from a session)
// doesn't exist yet.
resolversRouter.get(
  "/resolvers",
  asyncHandler(async (req, res) => {
    const { teamId } = req.query as Record<string, string | undefined>;
    const resolvers = await prisma.resolver.findMany({
      where: { teamId: teamId || undefined },
      orderBy: { name: "asc" },
    });
    res.json(resolvers);
  })
);
