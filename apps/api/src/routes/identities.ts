import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../lib/asyncHandler";

export const identitiesRouter = Router();

// GET /api/identity/:id — read one identity's webform-relevant context (name, role,
// designation, circle, branch, reportingManagerId). This is a stand-in for what a
// decoded signed submission link (spec's GET /api/webform/:token, ADR-002) would hand
// the website once JWT auth exists; not itself in the spec's D2 list, but needed now so
// the website form has something to pre-fill from. Read-only, no PII beyond what the
// webform is specified to display.
identitiesRouter.get(
  "/identity/:id",
  asyncHandler(async (req, res) => {
    const identity = await prisma.identity.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        role: true,
        designation: true,
        department: true,
        circle: true,
        branch: true,
        employmentStatus: true,
        reportingManagerId: true,
      },
    });
    if (!identity) throw new HttpError(404, "Identity not found");
    res.json(identity);
  })
);
