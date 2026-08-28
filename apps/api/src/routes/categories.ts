import { Router } from "express";
import type { Role, TicketType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../lib/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";

export const categoriesRouter = Router();

// Category/Subcategory aren't RLS-protected tables (only Ticket/Message/Attachment/
// AuditLog are — see packages/db's row-level-security migration) — they're the shared
// menu every role reads from, just filtered by role in the query itself, so these
// routes use the plain `prisma` client throughout, no withRlsContext needed.

// GET /api/categories?role=&ticketType= — role-gated tree per ADR-008. ticketType lets
// callers ask for the FOS-level grievance tree (default) or the lighter Request set
// (ADR-007) without the two blurring together. A Subcategory with an empty
// roleVisibility array is visible to every role (schema-documented default) — the
// filter below is an OR, not a plain `has`, specifically so that "visible to all"
// case isn't wrongly excluded once a role filter is applied. Citizen-facing (the
// website's category picker) — no auth required. Omit role for the admin/unfiltered
// view (spec D2).
categoriesRouter.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const role = req.query.role as Role | undefined;
    const ticketType = (req.query.ticketType as TicketType | undefined) ?? "GRIEVANCE";

    const departments = await prisma.department.findMany({
      include: {
        categories: {
          where: { ticketType },
          include: {
            subcategories: {
              where: role
                ? { OR: [{ roleVisibility: { isEmpty: true } }, { roleVisibility: { has: role } }] }
                : undefined,
            },
          },
        },
      },
    });

    // Drop departments/categories that end up with no visible subcategories once
    // role-filtered, so the tree returned matches what the caller can actually select.
    const filtered = departments
      .map((dept) => ({
        ...dept,
        categories: dept.categories.filter((cat) => cat.subcategories.length > 0),
      }))
      .filter((dept) => dept.categories.length > 0);

    res.json(filtered);
  })
);

// POST /api/categories — admin: create category
categoriesRouter.post(
  "/categories",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const {
      departmentId,
      name,
      defaultTatHours,
      escalationContactId,
      requiresWebForm,
      ticketType,
      isConfidential,
    } = req.body ?? {};

    if (!departmentId || !name || typeof defaultTatHours !== "number") {
      throw new HttpError(400, "departmentId, name, and defaultTatHours are required");
    }

    const category = await prisma.category.create({
      data: {
        departmentId,
        name,
        defaultTatHours,
        escalationContactId: escalationContactId ?? null,
        requiresWebForm: requiresWebForm ?? false,
        ticketType: ticketType ?? "GRIEVANCE",
        isConfidential: isConfidential ?? false,
      },
    });

    res.status(201).json(category);
  })
);

// PATCH /api/categories/:id — admin: edit TAT policy / confidentiality / escalation
// contact (ADR-005's "TAT policy changes are a ~20-row edit" — this is that edit).
categoriesRouter.patch(
  "/categories/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { defaultTatHours, escalationContactId, requiresWebForm, isConfidential } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (typeof defaultTatHours === "number") data.defaultTatHours = defaultTatHours;
    if (escalationContactId !== undefined) data.escalationContactId = escalationContactId;
    if (typeof requiresWebForm === "boolean") data.requiresWebForm = requiresWebForm;
    if (typeof isConfidential === "boolean") data.isConfidential = isConfidential;

    if (Object.keys(data).length === 0) throw new HttpError(400, "No recognized fields to update");

    const category = await prisma.category.update({ where: { id: req.params.id }, data });
    res.json(category);
  })
);

// POST /api/subcategories — admin: create subcategory (includes roleVisibility, ADR-008)
categoriesRouter.post(
  "/subcategories",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { categoryId, name, roleVisibility, resolverTeamId, tatHoursOverride } = req.body ?? {};

    if (!categoryId || !name || !Array.isArray(roleVisibility) || !resolverTeamId) {
      throw new HttpError(
        400,
        "categoryId, name, roleVisibility (array), and resolverTeamId are required"
      );
    }

    const subcategory = await prisma.subcategory.create({
      data: {
        categoryId,
        name,
        roleVisibility,
        resolverTeamId,
        tatHoursOverride: tatHoursOverride ?? null,
      },
    });

    res.status(201).json(subcategory);
  })
);

// PATCH /api/subcategories/:id — admin: edit roleVisibility (ADR-008's matrix editor),
// resolver team, or TAT override.
categoriesRouter.patch(
  "/subcategories/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { roleVisibility, resolverTeamId, tatHoursOverride } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (Array.isArray(roleVisibility)) data.roleVisibility = roleVisibility;
    if (resolverTeamId) data.resolverTeamId = resolverTeamId;
    if (tatHoursOverride !== undefined) data.tatHoursOverride = tatHoursOverride;

    if (Object.keys(data).length === 0) throw new HttpError(400, "No recognized fields to update");

    const subcategory = await prisma.subcategory.update({ where: { id: req.params.id }, data });
    res.json(subcategory);
  })
);
