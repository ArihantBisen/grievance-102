// SBOSS Grievance & Request System — database seed
// Fills: Department -> Category -> Subcategory tree (from categoryTaxonomy.ts — real,
// symptom-clubbed data reduced from Updated_categories_for_new_grievance.xlsx, see that
// file's header for the full methodology and what's real vs. deliberately synthetic),
// Teams, EscalationContacts, Resolvers, and a handful of test Identities covering every
// Role.

import { PrismaClient, Role, EmploymentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { categoryTaxonomy } from './categoryTaxonomy';

const prisma = new PrismaClient();

// Dev-only placeholder password for every seeded resolver/admin login — never used
// outside a local/demo database. Real credentials are a Part E step 8 concern (this
// pass built JWT auth fresh, with no CRM monorepo available to reuse from).
const DEV_PASSWORD_HASH = bcrypt.hashSync('sboss-dev-2026', 10);

async function main() {
  console.log('Seeding SBOSS Grievance System...');

  // ---- Departments ----
  const departmentNames = Array.from(new Set(categoryTaxonomy.map((d) => d.name)));
  const departments = await Promise.all(
    departmentNames.map((name) =>
      prisma.department.upsert({ where: { name }, update: {}, create: { name } })
    )
  );
  const deptByName = Object.fromEntries(departments.map((d) => [d.name, d]));

  // ---- Teams (keyed by the taxonomy's teamKey) ----
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
  const businessTeam = await prisma.team.create({
    data: { name: 'Business — Field Ops', departmentId: deptByName['Business'].id },
  });
  const financeTeam = await prisma.team.create({
    data: { name: 'Finance — Accounts', departmentId: deptByName['Finance'].id },
  });

  const teamsByKey: Record<string, { id: string }> = {
    it: itTeam,
    hrGeneral: hrGeneralTeam,
    hrConfidential: hrConfidentialTeam,
    business: businessTeam,
    finance: financeTeam,
  };

  // ---- Category tree, built from categoryTaxonomy.ts ----
  // EscalationContact has no unique constraint on email, so contacts shared across
  // categories (a department's general contact, reused for several category groups)
  // are deduped within this run rather than creating a duplicate row per category.
  const escalationContactByEmail = new Map<string, string>();
  async function escalationContactId(email: string | undefined): Promise<string | undefined> {
    if (!email) return undefined;
    const cached = escalationContactByEmail.get(email);
    if (cached) return cached;
    const contact = await prisma.escalationContact.create({ data: { email, level: 1 } });
    escalationContactByEmail.set(email, contact.id);
    return contact.id;
  }

  for (const dept of categoryTaxonomy) {
    const department = deptByName[dept.name];
    for (const cat of dept.categories) {
      const contactId = await escalationContactId(cat.escalationEmail);
      const category = await prisma.category.create({
        data: {
          name: cat.name,
          departmentId: department.id,
          ticketType: cat.ticketType,
          defaultTatHours: cat.defaultTatHours,
          isConfidential: cat.isConfidential ?? false,
          requiresWebForm: cat.requiresWebForm ?? false,
          escalationContactId: contactId ?? null,
        },
      });
      const team = teamsByKey[cat.teamKey];
      for (const sub of cat.subcategories) {
        await prisma.subcategory.create({
          data: {
            name: sub.name,
            categoryId: category.id,
            resolverTeamId: team.id,
            roleVisibility: sub.roleVisibility,
            tatHoursOverride: sub.tatHoursOverride ?? null,
          },
        });
      }
    }
  }

  // ---- Resolvers (placeholder — real roster TBD). All log in with password
  // "sboss-dev-2026" (DEV_PASSWORD_HASH above) — dev/demo only. ----
  await prisma.resolver.createMany({
    data: [
      { name: 'Asha Rao', email: 'asha.rao@sboss.example', teamId: itTeam.id, passwordHash: DEV_PASSWORD_HASH },
      { name: 'Vikram Shah', email: 'vikram.shah@sboss.example', teamId: hrGeneralTeam.id, passwordHash: DEV_PASSWORD_HASH },
      { name: 'Committee Lead', email: 'hr-committee-lead@sboss.example', teamId: hrConfidentialTeam.id, passwordHash: DEV_PASSWORD_HASH },
      { name: 'Rakesh Iyer', email: 'rakesh.iyer@sboss.example', teamId: businessTeam.id, passwordHash: DEV_PASSWORD_HASH },
      { name: 'Meera Pillai', email: 'meera.pillai@sboss.example', teamId: financeTeam.id, passwordHash: DEV_PASSWORD_HASH },
      {
        name: 'SBOSS Admin',
        email: 'admin@sboss.example',
        teamId: itTeam.id, // isAdmin bypasses team-scoped RLS — team assignment here is required by schema, not meaningful
        passwordHash: DEV_PASSWORD_HASH,
        isAdmin: true,
      },
    ],
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

  // ---- One open ticket belonging to the INACTIVE identity (ADR-010) — otherwise the
  // Admin Console's "tickets requiring reassignment" queue has nothing to show. ----
  const inactiveIdentity = await prisma.identity.findUniqueOrThrow({ where: { externalId: 'EMP1008' } });
  const loginSubcategory = await prisma.subcategory.findFirstOrThrow({
    where: { name: 'Login / Access Issue', category: { name: 'SBOSS Assist App' } },
    include: { category: true },
  });
  // Ticket is RLS-protected (packages/db's row-level-security migration) — a plain
  // insert with no session context set is correctly rejected, so this runs the same
  // admin-bypass session vars the API's withSystemRls helper sets per-request.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_team_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.is_admin', 'true', true)`;
    await tx.ticket.create({
    data: {
      identityId: inactiveIdentity.id,
      departmentId: loginSubcategory.category.departmentId,
      categoryId: loginSubcategory.categoryId,
      subcategoryId: loginSubcategory.id,
      teamId: loginSubcategory.resolverTeamId,
      channel: 'WHATSAPP',
      tatDueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      lastInboundAt: now,
      messages: {
        create: {
          senderType: 'USER',
          body: 'Still unable to log in to the Assist app.',
          channelType: 'FREETEXT',
        },
      },
    },
    });
  });

  console.log('Seed complete — real (symptom-clubbed) category taxonomy loaded from categoryTaxonomy.ts.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
