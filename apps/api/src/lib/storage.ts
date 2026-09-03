import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Built behind an interface — same "swap the real implementation in later without
// touching call sites" pattern as NotificationSender (ADR-003) — so a real object
// store (S3-compatible or otherwise) can replace LocalDiskStorage without changing
// the upload route or anything that reads Attachment.fileUrl.
export interface StorageBackend {
  save(buffer: Buffer, originalFilename: string): Promise<{ url: string }>;
}

// Anchored to this file's own location, not process.cwd() — the API can be launched
// from the repo root or from apps/api itself (both happen in practice: npm workspace
// scripts vs. a direct `tsx apps/api/src/index.ts`), and cwd-relative would silently
// land the uploads folder in the wrong place depending on which.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads");
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

export class LocalDiskStorage implements StorageBackend {
  async save(buffer: Buffer, originalFilename: string): Promise<{ url: string }> {
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Randomized filename — never trust the client-supplied name for a filesystem
    // path (traversal risk); the original extension is kept only for content-type
    // friendliness when served back.
    const ext = path.extname(originalFilename).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
    const filename = `${randomUUID()}${ext}`;
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);

    return { url: `${API_BASE_URL}/uploads/${filename}` };
  }
}
