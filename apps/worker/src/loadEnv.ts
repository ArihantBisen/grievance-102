// Loads the repo-root .env regardless of which directory this process was launched
// from — an `npm run dev --workspace=apps/worker` sets cwd to apps/worker itself,
// while a direct `tsx apps/worker/src/index.ts` from the repo root does not, so
// dotenv's default cwd-relative lookup would silently miss the file depending on
// which. Anchored to this file's own location instead (same fix as UPLOAD_DIR's
// earlier cwd bug in apps/api).
//
// Must be the very first thing apps/worker/src/index.ts imports — @sboss/whatsapp-client's
// getNotificationSender() reads process.env.META_ACCESS_TOKEN at call time, and
// @sboss/db's PrismaClient reads process.env.DATABASE_URL at construction time.
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
