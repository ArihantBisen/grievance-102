// SBOSS Grievance & Request System — real category taxonomy
//
// Source: `Updated_categories_for_new_grievance.xlsx`, sheets `Off-Roll`, `onroll`,
// `HR partners`, `SBI` (~83 raw Department/Category/Subcategory rows across the first
// two sheets, plus a vendor-contact matrix and a flat SBI query list).
//
// This is NOT a raw import — it's reduced per the agreed symptom-clubbing approach:
//   - Off-Roll and onroll are ~95% the same Department -> Category -> Subcategory tree
//     (confirms spec A1's "one shared tree across segments" design) — merged into one.
//   - Within a Category, near-duplicate raw Subcategory rows are clubbed into fewer,
//     broader canonical subcategories (e.g. "SBOSS Assist App Related" went from 16 raw
//     rows to 4: Login/Access, Mapping, Data Visibility, App Functionality). This trades
//     the raw sheet's granularity for a menu people can actually scan (ADR-008's whole
//     point), while the WHATSAPP_MENU_NOTES on each subcategory keep the original raw
//     labels as free-text context for whoever finishes the reduction — they are NOT
//     persisted to the DB (Subcategory has no field for them).
//
// TAT hours are NOT in the source spreadsheet at all (it only has resolver/escalation
// contacts) — every defaultTatHours below is a placeholder pending real sign-off from
// each department head (ADR-005's "TAT policy" is explicitly their call, not inferred
// from a support spreadsheet).
//
// Real contact emails from the sheet populate escalationEmail (-> EscalationContact.email
// — the schema has no name field, so no PII beyond a role-based work email address).
// Personal mobile numbers present in the source sheet are deliberately NOT reproduced
// here or anywhere in this repo — a data-minimization call consistent with ADR-006's own
// DPDP reasoning, not an oversight.
//
// Two categories below are NOT from the sheet at all and stay as clearly-marked
// additions: "Harassment / Conduct" (ADR-009 needs a demoable confidential-routing
// category, and the raw ops-support spreadsheet simply doesn't carry HR-sensitive
// complaint types) and "Sanction Status Check" (ADR-007's own example of a Request
// category, with no equivalent raw row).
//
// Known gaps, left as comments rather than silently guessed: the Role enum has no
// dedicated value for HR-partner vendor staff, so those categories below are visible to
// all roles (roleVisibility: []) rather than gated to a role that doesn't exist; and the
// "Collection" IT category's raw rows never listed a resolver contact, so it falls back
// to the IT department's general contact.

import { Role, TicketType } from "@prisma/client";

export interface SubcategorySeed {
  name: string;
  roleVisibility: Role[];
  tatHoursOverride?: number;
}

export interface CategorySeed {
  name: string;
  ticketType: TicketType;
  defaultTatHours: number;
  isConfidential?: boolean;
  requiresWebForm?: boolean;
  escalationEmail?: string;
  teamKey: string; // resolved to a Team id in seed.ts
  subcategories: SubcategorySeed[];
}

export interface DepartmentSeed {
  name: string;
  categories: CategorySeed[];
}

const ALL_ROLES: Role[] = []; // empty = visible to all roles (ADR-008)
const SBI_ONLY: Role[] = [Role.SBI_DEPUTED];
const SEVA_SARATHI_ONLY: Role[] = [Role.SEVA_SARATHI];
// Finance Department appears only in the onroll sheet, not off-roll — Seva Sarathi
// staff (explicitly off-roll, per the Role enum's own comment) are excluded here.
const NOT_SEVA_SARATHI: Role[] = [
  Role.FOS,
  Role.TEAM_LEAD,
  Role.TM,
  Role.CM,
  Role.SBI_DEPUTED,
  Role.SBOSS_STAFF,
];
const REQUEST_ROLES: Role[] = [Role.TEAM_LEAD, Role.TM, Role.CM, Role.SBI_DEPUTED];

export const categoryTaxonomy: DepartmentSeed[] = [
  {
    name: "HR",
    categories: [
      {
        name: "ID Card",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 24,
        escalationEmail: "cc7@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [
          { name: "Changes in ID Card", roleVisibility: ALL_ROLES },
          { name: "ID Card Lost", roleVisibility: ALL_ROLES },
          { name: "ID Card Not Issued", roleVisibility: ALL_ROLES },
          { name: "ID Card Reissue", roleVisibility: ALL_ROLES },
        ],
      },
      {
        name: "Legal / Compliance",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        escalationEmail: "bus6@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [
          // clubs raw: Complaint Team > Legal Disputes; Compliance > ESIC Card
          { name: "Legal Dispute", roleVisibility: ALL_ROLES },
          { name: "ESIC Card", roleVisibility: ALL_ROLES },
        ],
      },
      {
        name: "Workline / Attendance",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 24,
        escalationEmail: "Attendance@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [
          // Absconding kept distinct (serious/time-sensitive, not a symptom to club).
          { name: "Absconding", roleVisibility: ALL_ROLES, tatHoursOverride: 12 },
          // clubs raw: Attendence Issue, Leave Issue, Attendence Related Queries
          // (the source sheet has both a "Workline" and a separate "Attendance"
          // category carrying near-identical subcategories with the same resolver —
          // textbook symptom-clubbing case).
          { name: "Attendance / Leave Issue", roleVisibility: ALL_ROLES },
          { name: "Designation Related Issue", roleVisibility: ALL_ROLES },
          // clubs raw: Lat-Long, Mobile Number Correction, Personal Information
          // Correction, Update Branch Mapping, Update Reporting Manager, Update Team
          // Mapping
          { name: "Employee Data Correction", roleVisibility: ALL_ROLES },
          // clubs raw: Workline Activation/Deactivation, Workline Blocked, Workline
          // Password Reset
          { name: "Workline Access Issue", roleVisibility: ALL_ROLES, tatHoursOverride: 12 },
        ],
      },
      {
        name: "Resignation / Separation",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        escalationEmail: "hr.ops@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [
          { name: "Relieving / Experience Letter", roleVisibility: ALL_ROLES },
          { name: "Resignation", roleVisibility: ALL_ROLES },
        ],
      },
      {
        name: "Payroll",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 24,
        escalationEmail: "hr25@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [
          // clubs raw: Less Salary Received, Salary Not Received
          { name: "Salary Not / Short Received", roleVisibility: ALL_ROLES },
          { name: "Salary Slip", roleVisibility: ALL_ROLES },
        ],
      },
      {
        name: "Learning & Development",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        escalationEmail: "hr43@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [{ name: "Training Related", roleVisibility: ALL_ROLES }],
      },
      {
        name: "Full & Final Settlement",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        escalationEmail: "hr.ops@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [{ name: "F&F Related Query", roleVisibility: ALL_ROLES }],
      },
      {
        // NOT in the source spreadsheet — the raw sheet is an IT/HR-ops support
        // taxonomy and doesn't carry HR-sensitive complaint types at all. Added so
        // ADR-009's confidential-routing boundary (explicitly on the spec's
        // "do not cut" list) is demoable. Real subcategory wording pending HR sign-off.
        name: "Harassment / Conduct",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        isConfidential: true,
        escalationEmail: "hr-committee-lead@sboss.example",
        teamKey: "hrConfidential",
        subcategories: [{ name: "Workplace Conduct Concern", roleVisibility: ALL_ROLES }],
      },
      {
        // HR Partners sheet: a vendor-contact matrix (16 vendor companies x
        // Recruitment/Finance/BGV-Billing), not a subcategory tree — modeled as one
        // lightweight category per function. Role enum has no dedicated HR-partner
        // value (a real gap, not modeled around), so these stay visible to all roles.
        // Per-vendor routing (16 companies) is Admin Console config, out of scope here
        // — escalationEmail below uses "Innov" (the sheet's first-listed vendor) as a
        // representative default.
        name: "HR Partner — Recruitment",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        escalationEmail: "it17@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [{ name: "General Query", roleVisibility: ALL_ROLES }],
      },
      {
        name: "HR Partner — Finance",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        escalationEmail: "ae3@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [{ name: "General Query", roleVisibility: ALL_ROLES }],
      },
      {
        name: "HR Partner — BGV & Billing",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        escalationEmail: "hr37@sboss.net.in",
        teamKey: "hrGeneral",
        subcategories: [{ name: "General Query", roleVisibility: ALL_ROLES }],
      },
    ],
  },
  {
    name: "Business",
    categories: [
      {
        name: "Incentives",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        escalationEmail: "bus5@sboss.net.in",
        teamKey: "business",
        subcategories: [
          { name: "Incentive Eligibility & Criteria", roleVisibility: ALL_ROLES },
          { name: "Incentive Not Received", roleVisibility: ALL_ROLES },
        ],
      },
      {
        // NOT in the source spreadsheet — kept from the original placeholder seed as
        // ADR-007's own worked example of a Request category. No equivalent raw row
        // exists (the sheet has no sanction-tracking data at all).
        name: "Sanction Status Check",
        ticketType: TicketType.REQUEST,
        defaultTatHours: 12,
        teamKey: "business",
        subcategories: [{ name: "Case Status Inquiry", roleVisibility: REQUEST_ROLES }],
      },
    ],
  },
  {
    name: "Finance",
    categories: [
      {
        // onroll sheet only — off-roll has no Finance section at all.
        name: "Accounts",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 48,
        escalationEmail: "ae4@sboss.net.in",
        teamKey: "finance",
        subcategories: [
          { name: "Vendor Payment Status", roleVisibility: NOT_SEVA_SARATHI },
          // clubs raw: Employee Reimbursement, Travel Expense Claim, Petty Cash Request
          { name: "Reimbursement & Expense Claim", roleVisibility: NOT_SEVA_SARATHI },
          { name: "Invoice Submission", roleVisibility: NOT_SEVA_SARATHI },
          { name: "TDS Deduction Query", roleVisibility: NOT_SEVA_SARATHI },
        ],
      },
    ],
  },
  {
    name: "IT",
    categories: [
      {
        name: "Bank Branch IT Issue",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 24,
        escalationEmail: "it10@sboss.net.in",
        teamKey: "it",
        subcategories: [
          { name: "LMS System — Branch Issue", roleVisibility: ALL_ROLES },
          { name: "Branch IT Issue", roleVisibility: ALL_ROLES },
        ],
      },
      {
        name: "Email & Jansamarth",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 12,
        escalationEmail: "it10@sboss.net.in",
        teamKey: "it",
        subcategories: [
          // clubs raw: Email Login Issue, Email Password Issue, ID Activation/
          // Deactivation, Email Blocked/Send Receive Issue
          { name: "Email Access Issue", roleVisibility: ALL_ROLES },
          // clubs raw: Mail Sending Issue, Mail Receiving Issue, Other Mail Related
          { name: "Mail Send/Receive Issue", roleVisibility: ALL_ROLES },
          // clubs raw category "Jansamarth Issues" > App Functionality Related, and
          // the "Jansamarth Portal Related" row that was (oddly) filed under Email
          // Related in the source sheet.
          { name: "Jansamarth Portal / App Issue", roleVisibility: ALL_ROLES },
        ],
      },
      {
        name: "SBOSS Assist App",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 24,
        escalationEmail: "it10@sboss.net.in",
        teamKey: "it",
        subcategories: [
          // clubs raw: Unable to Login, Logout Issue, New ID Creation, ID Activation/
          // Deactivation/Reactivation
          { name: "Login / Access Issue", roleVisibility: ALL_ROLES, tatHoursOverride: 12 },
          // clubs raw: Branch/Circle/RBO Mapping, Reporting Manager Mapping
          { name: "Mapping Issue", roleVisibility: ALL_ROLES },
          // clubs raw: Report - Nil Movement, Sanctioned Cases Not Visible In Tab,
          // Leads Not Visible, Reports Related, Sent to LMS option not visible
          { name: "Data / Reports Not Visible", roleVisibility: ALL_ROLES },
          // clubs raw: Drop Down options are not showing, CLP Portal related,
          // Document Upload Issue, Camera Issue, Software Installation
          { name: "App Functionality Issue", roleVisibility: ALL_ROLES },
        ],
      },
      {
        name: "Tab & Device",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 24,
        escalationEmail: "it11@sboss.net.in",
        teamKey: "it",
        subcategories: [
          // clubs raw categories "Software Support" > Tab Hardening and "Tab Related"
          // > Other Tab Issues, Device Level Issue
          { name: "Tab Hardware Issue", roleVisibility: ALL_ROLES },
          // clubs raw: Forgot the Device Password, App Not visible, Tab Not Assigned
          { name: "Tab Access Issue", roleVisibility: ALL_ROLES },
          // clubs raw: Internet Connectivity, URL whitelisting
          { name: "Network / Whitelisting Issue", roleVisibility: ALL_ROLES },
        ],
      },
      {
        name: "Seva Sarathi Support",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 24,
        escalationEmail: "it10@sboss.net.in",
        teamKey: "it",
        subcategories: [
          // clubs raw: New ID Creation, Account Activation/Deactivation
          { name: "ID / Account Management", roleVisibility: SEVA_SARATHI_ONLY },
          // clubs raw: Branch/Circle/RBO Mapping, Reporting Manager Mapping
          { name: "Mapping Issue", roleVisibility: SEVA_SARATHI_ONLY },
          // clubs raw: Record Update, Showing Incorrect data
          { name: "Data Correction", roleVisibility: SEVA_SARATHI_ONLY },
        ],
      },
      {
        name: "Collection Support",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 24,
        // Raw sheet never lists a resolver for these rows — falls back to IT's general
        // contact rather than inventing one. Role gating also left open (ALL_ROLES):
        // "Collection" isn't a Role enum value, so this can't be gated precisely either.
        escalationEmail: "it10@sboss.net.in",
        teamKey: "it",
        subcategories: [
          // clubs raw: New ID Creation, Account Activation/Deactivation
          { name: "ID / Account Management", roleVisibility: ALL_ROLES },
          // clubs raw: Cluster Mapping, Reporting Manager Mapping
          { name: "Mapping Issue", roleVisibility: ALL_ROLES },
          // clubs raw: Record Update, Follow-ups Backtrack
          { name: "Records & Follow-up", roleVisibility: ALL_ROLES },
        ],
      },
      {
        // SBI sheet: 5 flat "Query Category" rows, gated to SBI_DEPUTED (AGM/DGM
        // staff). Kept under IT since every raw row is a Salesforce/mapping support
        // query, mechanically the same shape as the rest of this department's work.
        name: "SBI Salesforce & Mapping Support",
        ticketType: TicketType.GRIEVANCE,
        defaultTatHours: 24,
        escalationEmail: "it20@sboss.net.in",
        teamKey: "it",
        subcategories: [
          { name: "Salesforce Login Issue", roleVisibility: SBI_ONLY, tatHoursOverride: 12 },
          // clubs raw: Mapping Related (FOS/Seva Sarathi/ATM Mitra/CSP/FOS Collection),
          // Mapping of RBO/AO/Circle Not Visible, Duplicate RBO/AO Visible
          { name: "Mapping / RBO-AO-Circle Issue", roleVisibility: SBI_ONLY },
          { name: "Other Query", roleVisibility: SBI_ONLY },
        ],
      },
    ],
  },
];
