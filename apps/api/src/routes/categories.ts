import { Router } from "express";
import type { Role, TicketType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../lib/asyncHandler";

export const categoriesRouter = Router();

// GET /api/categories?role=&ticketType= — role-gated tree per ADR-008. ticketType lets
// callers ask for the FOS-level grievance tree (default) or the lighter Request set
// (ADR-007) without the two blurring together. A Subcategory with an empty
// roleVisibility array is visible to every role (schema-documented default) — the
// filter below is an OR, not a plain `has`, specifically so that "visible to all"
// case isn't wrongly excluded once a role filter is applied. Omit role for the
// admin/unfiltered view (spec D2).
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

// POST /api/subcategories — admin: create subcategory (includes roleVisibility, ADR-008)
categoriesRouter.post(
  "/subcategories",
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
