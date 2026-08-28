import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../lib/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";

export const teamsRouter = Router();

// GET /api/teams — list teams. Console-only, gated behind login (team/department
// structure isn't citizen-facing).
teamsRouter.get(
  "/teams",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const teams = await prisma.team.findMany({
      include: { department: true },
      orderBy: { name: "asc" },
    });
    res.json(teams);
  })
);

// POST /api/teams — admin: create a team (ADR-004's "resolver/team mapping").
teamsRouter.post(
  "/teams",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, departmentId, isConfidential } = req.body ?? {};
    if (!name || !departmentId) throw new HttpError(400, "name and departmentId are required");

    const team = await prisma.team.create({
      data: { name, departmentId, isConfidential: isConfidential ?? false },
      include: { department: true },
    });
    res.status(201).json(team);
  })
);
