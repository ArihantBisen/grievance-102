// SBOSS Grievance & Request System — database seed
// Fills: Department -> Category -> Subcategory tree, EscalationContacts, Teams,
// Resolvers, and a handful of test Identities covering every Role.
// Real category data comes from Updated_categories_for_new_grievance.xlsx, reduced per the
// symptom-clubbing rules already agreed (see build spec Part E, step 3) — NOT a raw import.
// This file is scaffolding: structure is real, category content is placeholder until the
// reduced taxonomy is finalized and dropped in here.

import { PrismaClient, TicketType, Role, EmploymentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding SBOSS Grievance System...');

  // ---- Departments ----
  const departments = await Promise.all(
    ['IT', 'HR', 'Business', 'Finance', 'Admin'].map((name) =>
      prisma.department.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );
  const deptByName = Object.fromEntries(departments.map((d) => [d.name, d]));

  // ---- Escalation contacts (placeholder addresses — real HR committee contacts still
  // to be collected, see ADR-009 action item 1) ----
  const itEscalation = await prisma.escalationContact.create({
    data: { email: 'it-escalation@sboss.example', level: 1 },
  });
  const hrConfidentialEscalation = await prisma.escalationContact.create({
    data: { email: 'hr-committee-lead@sboss.example', level: 1 },
  });

  // ---- Teams (including the HR-confidential committee team, per ADR-009) ----
  const itTeam = await prisma.team.create({
    data: { name: 'IT — App Support', departmentId: deptByName['IT'].id },
  });
  const hrGeneralTeam = await prisma.team.create({
    data: { name: 'HR — General', departmentId: deptByName['HR'].id },
  });
  const hrConfidentialTeam = await prisma.team.create({
    data: {
      name: 'HR — Confidential Committee',
      departmentId: deptByName['HR'].id,
      isConfidential: true, // ADR-009: separate from hrGeneralTeam, RLS-restricted to committee members only
    },
  });

  // ---- Resolvers (placeholder — real roster TBD) ----
  await prisma.resolver.createMany({
    data: [
      { name: 'Asha Rao', email: 'asha.rao@sboss.example', teamId: itTeam.id },
      { name: 'Vikram Shah', email: 'vikram.shah@sboss.example', teamId: hrGeneralTeam.id },
      { name: 'Committee Lead', email: 'hr-committee-lead@sboss.example', teamId: hrConfidentialTeam.id },
    ],
  });

  // ---- Example Category + Subcategory (placeholder — replace with real reduced taxonomy) ----
  const loginCategory = await prisma.category.create({
    data: {
      name: 'SBOSS Assist App',
      departmentId: deptByName['IT'].id,
      ticketType: TicketType.GRIEVANCE,
      defaultTatHours: 24,
      requiresWebForm: false,
      escalationContactId: itEscalation.id,
    },
  });
  await prisma.subcategory.create({
    data: {
      name: 'Unable to Login',
      categoryId: loginCategory.id,
      resolverTeamId: itTeam.id,
      roleVisibility: [], // empty = visible to all roles
    },
  });

  // ---- Example HR-confidential category (ADR-009) ----
  const conductCategory = await prisma.category.create({
    data: {
      name: 'Harassment / Conduct',
      departmentId: deptByName['HR'].id,
      ticketType: TicketType.GRIEVANCE,
      defaultTatHours: 48,
      isConfidential: true,
      escalationContactId: hrConfidentialEscalation.id,
    },
  });
  await prisma.subcategory.create({
    data: {
      name: 'Workplace Conduct Concern',
      categoryId: conductCategory.id,
      resolverTeamId: hrConfidentialTeam.id,
      roleVisibility: [],
    },
  });

  // ---- Example Request category (ADR-007) — separate, lighter tree, role-gated ----
  const requestCategory = await prisma.category.create({
    data: {
      name: 'Sanction Status Check',
      departmentId: deptByName['Business'].id,
      ticketType: TicketType.REQUEST,
      defaultTatHours: 12,
    },
  });
  await prisma.subcategory.create({
    data: {
      name: 'Case Status Inquiry',
      categoryId: requestCategory.id,
      resolverTeamId: itTeam.id, // placeholder — real routing TBD
      roleVisibility: [Role.TEAM_LEAD, Role.TM, Role.CM, Role.SBI_DEPUTED],
    },
  });

  // ---- Test identities — one per Role, plus one INACTIVE (ADR-010), to exercise the
  // Ticketing Core API end-to-end before the real Workline sync (D2a) exists. ----
  const now = new Date();
  const testIdentities: Array<{
    externalId: string;
    personalMobileNo: string;
    name: string;
    role: Role;
    designation: string;
    employmentStatus?: EmploymentStatus;
  }> = [
    { externalId: 'EMP1001', personalMobileNo: '919810000001', name: 'Farhan Iqbal', role: Role.FOS, designation: 'Field Officer' },
    { externalId: 'EMP1002', personalMobileNo: '919810000002', name: 'Priya Nair', role: Role.TEAM_LEAD, designation: 'FOS Team Lead' },
    { externalId: 'EMP1003', personalMobileNo: '919810000003', name: 'Rohit Malhotra', role: Role.TM, designation: 'Territory Manager' },
    { externalId: 'EMP1004', personalMobileNo: '919810000004', name: 'Sunita Desai', role: Role.CM, designation: 'Circle Manager' },
    { externalId: 'EMP1005', personalMobileNo: '919810000005', name: 'Arvind Menon', role: Role.SBI_DEPUTED, designation: 'AGM' },
    { externalId: 'EMP1006', personalMobileNo: '919810000006', name: 'Kavita Joshi', role: Role.SBOSS_STAFF, designation: 'Consultant' },
    { externalId: 'EMP1007', personalMobileNo: '919810000007', name: 'Deepak Kumar', role: Role.SEVA_SARATHI, designation: 'Seva Sarathi' },
    {
      externalId: 'EMP1008',
      personalMobileNo: '919810000008',
      name: 'Former Employee',
      role: Role.FOS,
      designation: 'Field Officer',
      employmentStatus: EmploymentStatus.INACTIVE, // exercises ADR-010's orphaned-ticket path
    },
  ];

  for (const record of testIdentities) {
    await prisma.identity.upsert({
      where: { externalId: record.externalId },
      update: {},
      create: {
        externalId: record.externalId,
        personalMobileNo: record.personalMobileNo,
        name: record.name,
        role: record.role,
        designation: record.designation,
        employmentStatus: record.employmentStatus ?? EmploymentStatus.ACTIVE,
        lastSyncedAt: now,
      },
    });
  }

  console.log('Seed complete (placeholder category data — real taxonomy still to be loaded).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
