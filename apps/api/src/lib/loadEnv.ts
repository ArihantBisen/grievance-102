// Loads the repo-root .env regardless of which directory this process was launched
// from — an `npm run dev --workspace=apps/api` sets cwd to apps/api itself, while a
// direct `tsx apps/api/src/index.ts` from the repo root does not, so dotenv's default
// cwd-relative lookup would silently miss the file depending on which. Anchored to
// this file's own location instead (same fix as UPLOAD_DIR's earlier cwd bug).
//
// Must be the very first thing apps/api/src/index.ts imports — every other module
// (e.g. lib/jwt.ts) reads process.env.* at import time, so this needs to run before
// any of them are required.
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", "..", ".env") });
