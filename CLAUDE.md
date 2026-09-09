# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SBOSS Grievance & Request System — an npm-workspaces monorepo implementing a citizen/
employee grievance-and-request ticketing system with WhatsApp Business Cloud API as the
primary submission/conversation channel, plus a resolver console and an admin console.

`README.md` is the fuller day-to-day reference (setup, full API surface, per-app status).
`README.md` names `SBOSS-Grievance-Build-Spec.md` as the project's source of truth (11
ADRs + schema + API contract + build order) — that file is **not actually present in this
repo**; treat the schema, code, and README as the working source of truth instead.

## Commands

```bash
# First-time setup
npm install
cp packages/db/.env.example packages/db/.env    # fill in real DATABASE_URL
cp .env.example .env                            # DATABASE_URL + PORT + JWT_SECRET, for apps/api
npm run db:generate
npm run db:migrate            # dev migration (prisma migrate dev)
npm run db:seed               # loads category taxonomy + test identities/resolvers

# Running each piece (separate terminals; no combined "dev all" script exists)
npm run dev:api                                # apps/api on :4000
npm run dev --workspace=apps/worker            # outbox/breach poller, no port
npm run dev --workspace=apps/website           # :5173, needs ?identityId=<id> in the URL
npm run dev --workspace=apps/resolver-console  # :5174, login required
npm run dev --workspace=apps/admin-console     # :5175, admin login required

# Building one workspace (frontends run tsc --noEmit then vite build; apps/api and
# apps/worker run tsc then run from dist/ via `npm run start`)
npm run build --workspace=<apps/api|apps/worker|apps/website|apps/resolver-console|apps/admin-console>

# Migrations in production (owning/superuser DB role required — see RLS section below)
npm run db:migrate:deploy

# Prisma Studio (packages/db)
npm run db:studio
```

There is no test suite and no lint script configured anywhere in this repo — verification
so far has been done by hand against a real local Postgres instance (`initdb`/`pg_ctl`,
real `prisma migrate deploy` + seed, then real `curl`/`psql` against the running API) and
via each frontend's `tsc --noEmit` + `vite build`, not via automated tests.

## Architecture

### Monorepo layout
```
apps/
  api/               Express + Prisma — Ticketing Core, Identity reads, WhatsApp webhook receiver
  worker/            Outbox Worker + TAT-breach scheduler (two poll loops, no HTTP port)
  resolver-console/  React/Vite — internal, resolver-facing (JWT login)
  admin-console/     React/Vite — internal, admin-facing (JWT login, admin-only)
  website/           React/Vite — public grievance/request submission form
packages/
  db/                Prisma schema + hand/CLI-written migrations + seed script
  design-tokens/     Shared CSS variables + component classes (SBOSS Design Language),
                     imported by all three frontends' main.tsx before their own styles.css
  shared-types/      TS types + small pure helpers shared across apps (no build step —
                     consumed directly as source via the workspace symlink)
  whatsapp-client/   Meta Cloud API client + logging stub behind one NotificationSender
                     interface, shared by apps/api's webhook receiver and apps/worker
```

### Request flow and channel model
Citizens interact via WhatsApp (primary) or the website form (reached via a link the
webhook hands out — currently a bare `?identityId=` query param standing in for a real
signed link). Both paths converge on `apps/api`'s ticket routes. Resolvers/admins act
through their own consoles against the same API, authenticated via JWT
(`apps/api/src/middleware/auth.ts`'s `requireAuth`/`requireAdmin`). All outbound
WhatsApp/email traffic is queued as `Message` rows with `deliveryStatus = PENDING` — that
table *is* the outbox, there's no separate queue table — and `apps/worker` polls and
dispatches them through `packages/whatsapp-client`'s `NotificationSender`. A second poll
loop in the worker (`breachCheck.ts`) finds open tickets past `tatDueAt` and escalates
them, writing a `SYSTEM` message the same outbox path then delivers.

### Postgres RLS — the single most important gotcha in this codebase
Team-scoping (a resolver only sees their own team's tickets; HR-confidential grievances
are only visible to the confidential team) is enforced by real Postgres row-level
security with `FORCE ROW LEVEL SECURITY` on `Ticket`/`Message`/`Attachment`/`AuditLog`
(`packages/db/prisma/migrations/20260828150400_add_row_level_security`), keyed off
`app.current_team_id`/`app.is_admin` session variables. **Postgres exempts superusers and
`BYPASSRLS` roles from RLS unconditionally — `FORCE ROW LEVEL SECURITY` does not override
that**, and the official `postgres` Docker image makes `POSTGRES_USER` a superuser by
default. The app must run as the restricted `sboss_app` role created by
`packages/db/sql/create-app-role.sql`, never as the migration-owning superuser — see
README's "Required: run the app as a non-superuser database role" section for exact
commands and the verification query. Every request-scoped DB read/write in `apps/api`
goes through `apps/api/src/lib/rls.ts`'s `withRlsContext` (resolver session — team-scoped)
or `withSystemRls` (citizen-facing/system routes and the worker — admin bypass, since
there's no resolver session to scope by on those paths). Any new query added to
`apps/worker` that doesn't go through `withSystemRls` will silently get zero rows back,
not an error — this has been a real, previously-shipped bug.

### The reversibility pattern (used twice, same shape both times)
`packages/whatsapp-client`'s `NotificationSender` and `apps/api/src/lib/storage.ts`'s
`StorageBackend` are both one-method interfaces with a small env-driven factory
(`getNotificationSender()`, `getStorageBackend()`) that picks a real implementation when
credentials/config are present and a safe local/dev stand-in otherwise (a logging stub
for WhatsApp sends; local disk vs. S3 for uploads). Call sites depend only on the
interface — swapping the real implementation in has required zero changes to any call
site both times this has been done. Follow this pattern for any other "swap later"
integration point rather than branching on env vars at the call site.

### Ticket numbering
Grievance tickets (not requests, yet) get a human-facing reference like `#IT-00001`
alongside their cuid `id`. It's one **global** counter across every department
(`TicketSequence`, a single row, incremented via `UPDATE ... RETURNING` inside the same
transaction ticket creation runs in — atomic under Postgres row locking, verified against
concurrent creation requests), not a per-department counter — the digits reflect overall
creation order system-wide, the department prefix (`Department.prefix`) just labels which
department it belongs to. `Ticket.ticketNumber` is nullable; every display/matching site
falls back to `t.id.slice(-8)` when it's null (i.e. a REQUEST ticket). `stripToAlphanumeric`
(`packages/shared-types`) is used both when formatting and when matching an inbound
WhatsApp reply against a citizen's open tickets, so `IT-00001`, `#it00001`, and
`it 00001 fyi` all resolve to the same ticket regardless of exact punctuation/case.

### Auth model
Two separate auth surfaces: JWT for resolvers/admins (`POST /api/auth/login`, 8h expiry,
carries `{sub, email, name, teamId, isAdmin}`, checked by `requireAuth`/`requireAdmin`),
and no real auth yet for citizens (`GET /api/identity/:id` takes a raw id with no
signature/expiry — flagged as a known gap, not the finished design). Every seeded
resolver/admin login shares one dev-only password (`sboss-dev-2026`, see
`packages/db/src/seed.ts`'s `DEV_PASSWORD_HASH`) — not a real secret, fine to reference
in local dev instructions.

### Route registration order matters
Express matches path segments literally before checking for `:param` patterns only if
routes are registered in the right order. A route like `GET /tickets/summary` must be
registered *before* `GET /tickets/:id` in the same router, or Express matches `summary`
as the `:id` param and the more specific route never fires. Watch for this when adding
any new fixed-segment route alongside an existing `:id`-style route in the same router.

### Category tree / role visibility
`packages/db/src/categoryTaxonomy.ts` is the real (not placeholder) category/subcategory
tree, reduced from a source spreadsheet — see that file's own header comment for
methodology and known gaps (no real TAT data in the source, some categories are
synthetic). `Subcategory.roleVisibility` uses "empty array = visible to all roles," not
"empty = visible to none" — this inversion has tripped up more than one earlier pass at
this code, double-check the semantics before touching visibility logic.

### Confidentiality
`Ticket.isConfidential` is always derived server-side from `Category.isConfidential`,
never client-supplied. Confidential grievances route to a dedicated HR-Confidential-
Committee team; the RLS team-scoping above is what actually enforces that wall — there's
no separate confidentiality check anywhere, it falls out of the same team-id filtering
for free.
