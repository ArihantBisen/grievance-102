import { Router } from "express";
import multer from "multer";
import { LocalDiskStorage } from "../lib/storage";
import { asyncHandler, HttpError } from "../lib/asyncHandler";

export const uploadsRouter = Router();

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.has(file.mimetype));
  },
});

const storage = new LocalDiskStorage();

// POST /api/uploads — multipart/form-data, single "file" field. Citizen-facing, same
// posture as ticket creation (this happens as part of the website's Attachments step,
// before any resolver session exists). Returns a URL to hand straight to
// POST /api/tickets's attachments array or POST /api/tickets/:id/attachments.
uploadsRouter.post(
  "/uploads",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "file is required (field name 'file'), and must be PNG/JPEG/WEBP/PDF under 10MB");
    }
    const { url } = await storage.save(req.file.buffer, req.file.originalname);
    res.status(201).json({ fileUrl: url });
  })
);
