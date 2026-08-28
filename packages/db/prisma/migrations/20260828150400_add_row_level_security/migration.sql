-- Postgres Row-Level Security for team-scoped ticket visibility (NFR: "Multi-tenant RLS
-- for team/department visibility, plus a hard wall for confidential tickets").
--
-- Design: a resolver's session sets two Postgres session variables per request
-- (app.current_team_id, app.is_admin — see apps/api/src/lib/rls.ts). A policy then
-- restricts every row to the caller's own team, unless app.is_admin = 'true'.
--
-- Confidential tickets get their wall "for free" from this alone, per ADR-009: a
-- confidential Subcategory always routes to the HR-Confidential-Committee team (see
-- seed.ts / the ticket-creation route), so a resolver whose session team isn't that
-- committee's team can never match teamId on a confidential ticket — no separate
-- isConfidential check needed in the policy itself.
--
-- FORCE ROW LEVEL SECURITY matters here specifically because the app's own DB user
-- owns these tables (a single dev/demo Postgres role) — RLS is normally bypassed for
-- the table owner unless FORCE is set, which would make this whole migration a no-op
-- against how this app actually connects.
--
-- System/citizen-facing routes (ticket creation, the WhatsApp status-check, the public
-- category tree) have no resolver session at all — they run with app.is_admin = 'true'
-- (a deliberate bypass: RLS protects resolver-visible data, not the citizen intake
-- path, which was never scoped to a team to begin with).

ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ticket" FORCE ROW LEVEL SECURITY;

CREATE POLICY ticket_team_scope ON "Ticket"
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR "teamId" = current_setting('app.current_team_id', true)
  );

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;

CREATE POLICY message_team_scope ON "Message"
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Ticket" t
      WHERE t.id = "Message"."ticketId"
        AND t."teamId" = current_setting('app.current_team_id', true)
    )
  );

ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attachment" FORCE ROW LEVEL SECURITY;

CREATE POLICY attachment_team_scope ON "Attachment"
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Ticket" t
      WHERE t.id = "Attachment"."ticketId"
        AND t."teamId" = current_setting('app.current_team_id', true)
    )
  );

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

CREATE POLICY auditlog_team_scope ON "AuditLog"
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Ticket" t
      WHERE t.id = "AuditLog"."ticketId"
        AND t."teamId" = current_setting('app.current_team_id', true)
    )
  );
