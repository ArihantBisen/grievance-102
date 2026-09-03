import { createHmac, timingSafeEqual } from "node:crypto";

// D2b: "Every inbound call includes an X-Hub-Signature-256 header — verify against
// your App Secret before processing." HMAC-SHA256 over the raw request body.
export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
