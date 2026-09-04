-- Global ticket numbering ("#IT-00001" style): one sequence shared across every
-- department, not a per-department counter — the prefix just labels which department a
-- ticket belongs to; the number itself reflects overall grievance-creation order.
-- Numbering is grievance-only for now (Ticket.ticketNumber stays NULL for REQUEST
-- tickets), so it's added nullable rather than NOT NULL.

-- 1. Department.prefix — added nullable first, backfilled, then locked down. The 4 real
--    department names are a fixed, known set (packages/db/src/categoryTaxonomy.ts).
ALTER TABLE "Department" ADD COLUMN "prefix" TEXT;

UPDATE "Department" SET "prefix" = CASE "name"
  WHEN 'HR' THEN 'HR'
  WHEN 'Business' THEN 'BUS'
  WHEN 'Finance' THEN 'FIN'
  WHEN 'IT' THEN 'IT'
END;

-- Fail loudly rather than silently leaving a NULL prefix that the NOT NULL constraint
-- below would reject with a much less helpful error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Department" WHERE "prefix" IS NULL) THEN
    RAISE EXCEPTION 'add_ticket_number: unmapped Department name(s) found — update the CASE above';
  END IF;
END $$;

ALTER TABLE "Department" ALTER COLUMN "prefix" SET NOT NULL;
CREATE UNIQUE INDEX "Department_prefix_key" ON "Department"("prefix");

-- 2. TicketSequence — exactly one row (id = 1), incremented atomically at ticket
--    creation time via UPDATE ... RETURNING inside the same transaction the ticket
--    insert runs in (apps/api/src/routes/tickets.ts).
CREATE TABLE "TicketSequence" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketSequence_pkey" PRIMARY KEY ("id")
);

-- 3. Ticket.ticketNumber — nullable; only GRIEVANCE tickets get one for now.
ALTER TABLE "Ticket" ADD COLUMN "ticketNumber" TEXT;

-- 4. Backfill existing GRIEVANCE tickets in global creation order (id as a tiebreaker
--    for identical timestamps), so history reads consistently with how new tickets will
--    be numbered going forward. Existing REQUEST tickets are left NULL.
WITH numbered AS (
  SELECT
    t.id,
    t."departmentId",
    ROW_NUMBER() OVER (ORDER BY t."createdAt" ASC, t.id ASC) AS rn
  FROM "Ticket" t
  WHERE t."ticketType" = 'GRIEVANCE'
)
UPDATE "Ticket" t
SET "ticketNumber" = '#' || d."prefix" || '-' || LPAD(numbered.rn::text, 5, '0')
FROM numbered
JOIN "Department" d ON d.id = numbered."departmentId"
WHERE t.id = numbered.id;

CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");

-- 5. Seed the sequence row, fast-forwarded past however many grievance tickets were
--    just backfilled — so the next ticket created continues the count rather than
--    colliding with a backfilled number.
INSERT INTO "TicketSequence" ("id", "counter")
VALUES (1, (SELECT COUNT(*) FROM "Ticket" WHERE "ticketType" = 'GRIEVANCE'));

-- 6. FK from Ticket to Department already exists (departmentId); this migration only
--    adds columns/tables, no new relations to wire up beyond what Prisma's schema
--    diffing expects.
