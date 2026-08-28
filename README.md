# SBOSS Grievance & Request System

Source of truth for every decision in this codebase: `SBOSS-Grievance-Build-Spec.md`
(11 ADRs + full schema + API contract + build order). This repo implements that spec —
if code and spec ever disagree, the spec is right until someone deliberately updates both.

## Structure

```
apps/
  api/               — Ticketing Core + Identity Service + webhook receiver
  worker/            — Outbox Worker (reliable WhatsApp/email dispatch)
  resolver-console/  — React, internal, resolver-facing
  admin-console/     — React, internal, admin-facing
  website/           — React, public-facing grievance submission form
packages/
  db/                — Prisma schema (schema.prisma is copied verbatim from the spec's
                       Part D1 — do not hand-edit model shapes without updating the spec)
  design-tokens/     — Shared CSS/Tailwind tokens (Part C of the spec)
  shared-types/      — TypeScript types shared across apps
infra/               — Deployment config (pending hosting/data-residency decision)
```

## First-time setup

```bash
npm install
cp packages/db/.env.example packages/db/.env    # fill in real DATABASE_URL
cp .env.example .env                            # DATABASE_URL + PORT, for apps/api
npm run db:generate
npm run db:migrate
npm run db:seed     # loads placeholder category data + test identities — see seed.ts header
npm run dev:api     # starts the Ticketing Core API on :4000
```

## API surface built so far

```
POST   /api/tickets                      create ticket (grievance, or REQUEST for
                                          TEAM_LEAD/TM/CM/SBI_DEPUTED identities — ADR-007)
GET    /api/tickets                      list (query filters: teamId, status, ticketType, identityId)
GET    /api/tickets/mine                 caller's own tickets (?identityId=&openOnly=) — backs
                                          multi-ticket disambiguation and the WhatsApp status-check (ADR-002)
GET    /api/tickets/:id                  ticket detail + message thread
PATCH  /api/tickets/:id                  update status / teamId / resolverId / priority
POST   /api/tickets/:id/reply            append a message; auto-transitions status;
                                          stamps lastInboundAt on a USER reply (24hr-window driver)
POST   /api/tickets/:id/escalate         manual escalation (AuditLog.escalationTrigger = MANUAL)
POST   /api/tickets/:id/attachments      record an uploaded file against a ticket

GET    /api/categories                   role- and ticketType-gated tree (?role=&ticketType=) — ADR-008
POST   /api/categories                   admin: create category
POST   /api/subcategories                admin: create subcategory
```

Every ticket mutation writes an `AuditLog` row in the same transaction (append-only, per
the audit NFR). `isConfidential` on a created ticket is always derived from
`Category.isConfidential` (ADR-009), never client-supplied. Not yet built, on purpose:
`/api/webhook/inbound`, `/api/webform/*`, `/api/identity/lookup`, `/api/auth/login` —
these depend on JWT auth, the Workline sync job, and the Meta Cloud API integration, none
of which are in scope for this pass. There is also no Postgres RLS enforcement yet — the
schema supports it (team/department FKs throughout) but enforcement is deferred to JWT
auth, same as callers filtering explicitly via query params until then.

## Status (Aug 28)

- [x] Monorepo scaffolded
- [x] Prisma schema in place (13 models, 13 enums — matches spec Part D1 exactly; fixed one
      bug in the verbatim copy — `Department` was missing the opposite relation field for
      `Ticket.department`, which Prisma requires)
- [x] Seed script — real structure, category content still placeholder; now also seeds
      EscalationContacts, Resolvers, and one test Identity per Role (incl. one INACTIVE, for
      ADR-010)
- [x] Ticketing Core API (`apps/api`) — tickets + categories routes, ported from
      grievance-101's implementation and corrected for this schema (role-based visibility
      with correct "empty = all roles" semantics, updated ADR-007 REQUEST-eligible role set,
      category-derived `isConfidential`, `/tickets/mine`, audit log on every mutator)
- [ ] Real category taxonomy (from `Updated_categories_for_new_grievance.xlsx`, reduced per
      the symptom-clubbing rules — not a raw import)
- [ ] JWT auth + RLS enforcement (Part E step 8 — reuse from the CRM monorepo)
- [ ] Identity Service (Workline Full + Incremental sync)
- [ ] WhatsApp Middleware (Meta Cloud API direct — see spec Part D2b)
- [ ] Resolver Console
- [ ] Website submission form
- [ ] Outbox Worker

Meta Business Verification: not started as of Aug 28. WhatsApp integration will run in
Meta test mode (temporary number, confirmed recipients only) for the demo — production
rollout to the full workforce is gated on verification completing, which is outside this
timeline's control.
