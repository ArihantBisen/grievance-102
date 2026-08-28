import type { Channel, Role, TicketType } from "@sboss/shared-types";

export interface IdentityContext {
  id: string;
  name: string;
  role: Role;
  designation: string | null;
  department: string | null;
  circle: string | null;
  branch: string | null;
  employmentStatus: "ACTIVE" | "INACTIVE";
  reportingManagerId: string | null;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  roleVisibility: Role[];
  resolverTeamId: string;
  tatHoursOverride: number | null;
}

export interface Category {
  id: string;
  departmentId: string;
  name: string;
  ticketType: TicketType;
  defaultTatHours: number;
  isConfidential: boolean;
  subcategories: Subcategory[];
}

export interface DepartmentTree {
  id: string;
  name: string;
  categories: Category[];
}

export interface DraftAttachment {
  fileUrl: string;
}

export type { Channel };
