import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { signAuthToken } from "../lib/jwt";
import { asyncHandler, HttpError } from "../lib/asyncHandler";

export const authRouter = Router();

// POST /api/auth/login — resolver/admin console login (spec D2). Resolver isn't an
// RLS-protected table, so this reads through the plain prisma client, not withRlsContext.
authRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) throw new HttpError(400, "email and password are required");

    const resolver = await prisma.resolver.findUnique({ where: { email } });
    if (!resolver) throw new HttpError(401, "Invalid credentials");

    const valid = await bcrypt.compare(password, resolver.passwordHash);
    if (!valid) throw new HttpError(401, "Invalid credentials");

    const token = signAuthToken({
      sub: resolver.id,
      email: resolver.email,
      name: resolver.name,
      teamId: resolver.teamId,
      isAdmin: resolver.isAdmin,
    });

    res.json({
      token,
      resolver: {
        id: resolver.id,
        name: resolver.name,
        email: resolver.email,
        teamId: resolver.teamId,
        isAdmin: resolver.isAdmin,
      },
    });
  })
);
