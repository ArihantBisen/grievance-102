// SBOSS Grievance & Request System — database seed
// Fills: Department -> Category -> Subcategory tree, EscalationContacts, Teams.
// Real category data comes from Updated_categories_for_new_grievance.xlsx, reduced per the
// symptom-clubbing rules already agreed (see build spec Part E, step 3) — NOT a raw import.
// This file is scaffolding: structure is real, category content is placeholder until the
// reduced taxonomy is finalized and dropped in here.

import { PrismaClient, TicketType, Role } from '@prisma/client';

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

  // ---- Example Category + Subcategory (placeholder — replace with real reduced taxonomy) ----
  const loginCategory = await prisma.category.create({
    data: {
      name: 'SBOSS Assist App',
      departmentId: deptByName['IT'].id,
      ticketType: TicketType.GRIEVANCE,
      defaultTatHours: 24,
      requiresWebForm: false,
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

  console.log('Seed complete (placeholder data — real taxonomy still to be loaded).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
