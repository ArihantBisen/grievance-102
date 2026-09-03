import type { Request } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

// D2b: Meta signs the raw request body bytes (X-Hub-Signature-256) — captured here via
// express.json()'s verify hook, since the parsed/re-serialized JSON body would not
// byte-for-byte match what Meta actually signed.
export function captureRawBody(req: Request, _res: unknown, buf: Buffer) {
  req.rawBody = buf;
}
