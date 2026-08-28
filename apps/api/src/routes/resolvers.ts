import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../lib/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";

export const resolversRouter = Router();

// GET /api/resolvers?teamId= — list resolvers. Console-only (not RLS-tabled, but still
// gated behind login rather than left open, since it's roster/contact information with
// no citizen-facing use).
resolversRouter.get(
  "/resolvers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { teamId } = req.query as Record<string, string | undefined>;
    const resolvers = await prisma.resolver.findMany({
      where: { teamId: teamId || undefined },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, teamId: true, presenceStatus: true, isAdmin: true },
    });
    res.json(resolvers);
  })
);

// POST /api/resolvers — admin: add a resolver (ADR-004's "resolver/team mapping").
// Returns no password — the admin sets an initial one, the resolver should change it
// once real self-service auth exists (out of scope for this pass).
resolversRouter.post(
  "/resolvers",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, email, teamId, password, isAdmin } = req.body ?? {};
    if (!name || !email || !teamId || !password) {
      throw new HttpError(400, "name, email, teamId, and password are required");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const resolver = await prisma.resolver.create({
      data: { name, email, teamId, passwordHash, isAdmin: isAdmin ?? false },
      select: { id: true, name: true, email: true, teamId: true, presenceStatus: true, isAdmin: true },
    });

    res.status(201).json(resolver);
  })
);

// PATCH /api/resolvers/:id — admin: reassign a resolver's team, or grant/revoke admin.
resolversRouter.patch(
  "/resolvers/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { teamId, isAdmin } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (teamId) data.teamId = teamId;
    if (typeof isAdmin === "boolean") data.isAdmin = isAdmin;
    if (Object.keys(data).length === 0) throw new HttpError(400, "No recognized fields to update");

    const resolver = await prisma.resolver.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, email: true, teamId: true, presenceStatus: true, isAdmin: true },
    });
    res.json(resolver);
  })
);
