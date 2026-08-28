import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";

export const teamsRouter = Router();

// GET /api/teams — list teams (id/name/department/isConfidential). Backs the Resolver
// Console's team picker (stand-in session) and reassignment dropdown; not in the spec's
// D2 list but needed now since JWT auth (which would derive team membership from a
// session) doesn't exist yet.
teamsRouter.get(
  "/teams",
  asyncHandler(async (_req, res) => {
    const teams = await prisma.team.findMany({
      include: { department: true },
      orderBy: { name: "asc" },
    });
    res.json(teams);
  })
);
