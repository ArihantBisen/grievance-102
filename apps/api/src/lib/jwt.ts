import jwt from "jsonwebtoken";

// Part E step 8. No CRM monorepo was reachable in this session to reuse its JWT auth
// from (the user couldn't locate it) — this is a fresh, minimal implementation, not a
// port. Swap for the CRM's own auth module later if it turns up; nothing downstream
// (the AuthPayload shape, the RLS session vars it feeds) needs to change to do that.

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Copy .env.example to .env and set a real secret before starting the API."
  );
}

const JWT_EXPIRES_IN = "8h";

export interface AuthPayload {
  sub: string; // Resolver.id
  email: string;
  name: string;
  teamId: string;
  isAdmin: boolean;
}

export function signAuthToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyAuthToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET as string) as AuthPayload;
}
