import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken, type AuthPayload } from "../lib/jwt";
import { HttpError } from "../lib/asyncHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

// Resolver/Admin Console auth (spec D2's POST /api/auth/login). Deliberately NOT
// applied to the citizen-facing routes (ticket creation, the public category tree,
// the webform identity read) — those have their own, still-unbuilt auth mechanism
// (ADR-002's signed link), and were never meant to require a resolver login.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) throw new HttpError(401, "Missing bearer token");

  try {
    req.auth = verifyAuthToken(token);
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw new HttpError(401, "Missing bearer token");
  if (!req.auth.isAdmin) throw new HttpError(403, "Admin access required");
  next();
}
