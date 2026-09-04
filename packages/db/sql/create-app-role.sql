-- Creates the least-privilege role the API and Outbox Worker should connect as.
--
-- WHY THIS EXISTS
-- ---------------
-- Every team-scoping guarantee in this system is enforced by Postgres row-level
-- security (packages/db/prisma/migrations/*_add_row_level_security). Those policies are
-- correct and are set to FORCE, but Postgres exempts two kinds of role from RLS
-- unconditionally, and FORCE cannot override it:
--
--   * SUPERUSER roles
--   * roles with the BYPASSRLS attribute
--
-- The official `postgres` Docker image makes POSTGRES_USER a superuser. So a stack
-- started with POSTGRES_USER=sboss and DATABASE_URL=postgres://sboss@... connects as a
-- superuser, every RLS policy is skipped, and any resolver can read and modify any
-- other team's tickets — including HR-confidential ones, which are exactly the cases
-- the policies exist to contain.
--
-- Running this script and pointing DATABASE_URL at sboss_app restores the isolation.
-- Verify with:
--   SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'sboss_app';
-- Both flags must be false.
--
-- Migrations still need the owner/superuser role — run `prisma migrate deploy` as
-- sboss, and run the application as sboss_app.
--
-- USAGE (adjust the database name and password to your environment):
--   psql "postgresql://sboss:sboss@localhost:5432/sboss_grievance" -f create-app-role.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sboss_app') THEN
    -- Change this password before using it anywhere that isn't a local dev database.
    CREATE ROLE sboss_app LOGIN PASSWORD 'sboss_app_pw'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE sboss_grievance TO sboss_app;
GRANT USAGE ON SCHEMA public TO sboss_app;

-- DML only: the app never needs DDL, and not owning the tables is part of why RLS
-- applies to it.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sboss_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sboss_app;

-- Tables created by future migrations need the same grants, or the app breaks the next
-- time the schema changes.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sboss_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sboss_app;
