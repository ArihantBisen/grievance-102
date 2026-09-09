import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

// Production backend — local disk doesn't survive a redeploy or work across more than
// one instance, both of which are expected once this runs on real hosting. Same
// randomized-filename/traversal-safety approach as LocalDiskStorage; the bucket is
// expected to be configured for public read (or fronted by a CDN) so the returned URL
// is directly fetchable, matching how LocalDiskStorage's /uploads URL behaves today.
export class S3Storage implements StorageBackend {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor(config: { bucket: string; region: string; publicBaseUrl?: string }) {
    this.client = new S3Client({ region: config.region });
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl ?? `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
  }

  async save(buffer: Buffer, originalFilename: string): Promise<{ url: string }> {
    const ext = path.extname(originalFilename).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
    const key = `${randomUUID()}${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
      })
    );
    return { url: `${this.publicBaseUrl}/${key}` };
  }
}

// Same env-driven factory pattern as packages/whatsapp-client's getNotificationSender():
// picks S3 automatically once AWS_S3_BUCKET/AWS_REGION are set, falls back to local disk
// otherwise — nothing else in the app needs to know or care which one is active.
export function getStorageBackend(): StorageBackend {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;

  if (bucket && region) {
    return new S3Storage({ bucket, region, publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL });
  }

  return new LocalDiskStorage();
}
