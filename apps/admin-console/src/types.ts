import type { Role, TicketType } from "@sboss/shared-types";

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
  requiresWebForm: boolean;
  escalationContactId: string | null;
  subcategories: Subcategory[];
}

export interface Department {
  id: string;
  name: string;
  categories: Category[];
}

export interface Team {
  id: string;
  name: string;
  departmentId: string;
  isConfidential: boolean;
  department?: { id: string; name: string };
}

export interface Resolver {
  id: string;
  name: string;
  email: string;
  teamId: string;
  presenceStatus: string;
  isAdmin: boolean;
}

export interface Identity {
  id: string;
  externalId: string;
  name: string;
  role: Role;
  roleClassifiedBy: string;
  designation: string | null;
  employmentStatus: "ACTIVE" | "INACTIVE";
  personalMobileNo: string | null;
}

export interface UnknownContact {
  id: string;
  phoneNumber: string;
  messageBody: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  attemptCount: number;
  reviewed: boolean;
  reviewedBy: string | null;
}

export interface OrphanedTicket {
  id: string;
  status: string;
  createdAt: string;
  identity: { id: string; name: string; externalId: string };
  category: { name: string };
  subcategory: { name: string } | null;
  team: { name: string };
}

export interface SyncRun {
  id: string;
  runType: "FULL" | "INCREMENTAL";
  status: "RUNNING" | "COMPLETED" | "FAILED";
  recordsFetched: number;
  recordsUpserted: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export const ALL_ROLES: Role[] = [
  "SBOSS_STAFF",
  "SBI_DEPUTED",
  "CM",
  "TM",
  "TEAM_LEAD",
  "FOS",
  "SEVA_SARATHI",
  "OTHER",
];
