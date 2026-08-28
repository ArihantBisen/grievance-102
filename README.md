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
npm run db:seed     # loads the real (symptom-clubbed) category taxonomy + test identities
npm run dev:api     # starts the Ticketing Core API on :4000

npm run dev --workspace=apps/website           # :5173, needs ?identityId=<id> in the URL
npm run dev --workspace=apps/resolver-console  # :5174
npm run dev --workspace=apps/worker            # polls the outbox, no port
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

GET    /api/identity/:id                 read one identity's webform context (name/role/
                                          designation/circle/branch) — stand-in for the
                                          signed-link decode (ADR-002) until JWT auth exists
GET    /api/resolvers                    list resolvers (?teamId=) — backs the console
GET    /api/teams                        list teams — backs the console's team picker
```

Every ticket mutation writes an `AuditLog` row in the same transaction (append-only, per
the audit NFR). `isConfidential` on a created ticket is always derived from
`Category.isConfidential` (ADR-009), never client-supplied. A `RESOLVER` reply outside
WhatsApp's 24hr customer-service window is forced to `channelType: TEMPLATE` regardless
of what the caller requested (D2/D2b) — checked again at dispatch time by the Outbox
Worker in case a message sat PENDING long enough for the window to close. Not yet built,
on purpose: `/api/webhook/inbound`, `/api/webform/*`, `/api/identity/lookup` (the phone-based
one), `/api/auth/login` — these depend on JWT auth, the Workline sync job, and the Meta
Cloud API integration, none of which are in scope for this pass. There is also no
Postgres RLS enforcement yet — the schema supports it (team/department FKs throughout)
but enforcement is deferred to JWT auth, same as callers filtering explicitly via query
params until then.

## Frontends and worker built so far

- **`apps/website`** — the "Submit a Grievance" 3-step wizard (ADR-002): Grievance
  Details → Supporting Documents → Review. Reached via `/?identityId=<id>`, a stand-in
  for the signed submission link until JWT/webform-token auth exists. Supports both
  GRIEVANCE and REQUEST ticket types (the latter only offered to REQUEST-eligible
  roles). Attachments are collected as URLs — real file upload / object storage isn't
  wired up yet.
- **`apps/resolver-console`** — queue (filterable by status, with a green/amber/red TAT
  indicator per Part C), ticket detail with thread, claim, reassign, reply, escalate,
  and resolve. No login yet — a team + "acting as" resolver picker stands in for a
  session, same deferred-auth posture as the API.
- **`apps/worker`** — Outbox Worker skeleton. Polls `Message` rows with
  `deliveryStatus = PENDING` (that *is* the outbox queue — no separate table needed,
  the schema already models it this way) and dispatches through a `NotificationSender`
  interface with one logging stub implementation, swappable for a real Meta Cloud API /
  email client later without touching the dispatch loop (same reversibility pattern as
  ADR-003). Re-applies the 24hr-window TEMPLATE check at dispatch time. Retries by
  simply leaving a failed message PENDING for the next poll cycle; gives up (marks
  `FAILED` + `deliveryError`) after 15 minutes of failures rather than a persisted
  attempt counter — a deliberate skeleton-scope simplification.
- **`packages/design-tokens`** — Part C's color tokens as CSS variables + badge/table/
  card/SLA-dot component classes, consumed by both frontends.

All three were driven end-to-end against a live local Postgres + API in this pass:
submit a grievance on the website → it lands in the resolver console's queue → claim →
reply → escalate/resolve → the worker picks up every outbound message and marks it
`SENT`, correctly skipping inbound `USER` messages and correctly promoting a
window-expired reply to `TEMPLATE` at dispatch time.

## Status (Aug 28)

- [x] Monorepo scaffolded
- [x] Prisma schema in place (13 models, 13 enums — matches spec Part D1 exactly; fixed one
      bug in the verbatim copy — `Department` was missing the opposite relation field for
      `Ticket.department`, which Prisma requires)
- [x] Seed script — real (symptom-clubbed) category taxonomy from `categoryTaxonomy.ts`
      (see below), plus EscalationContacts, Resolvers, and one test Identity per Role
      (incl. one INACTIVE, for ADR-010)
- [x] Ticketing Core API (`apps/api`) — tickets + categories routes, ported from
      grievance-101's implementation and corrected for this schema (role-based visibility
      with correct "empty = all roles" semantics, updated ADR-007 REQUEST-eligible role set,
      category-derived `isConfidential`, `/tickets/mine`, audit log on every mutator);
      plus the 24hr WhatsApp-window TEMPLATE fallback on reply, a SYSTEM confirmation
      message on ticket creation, and small `/api/identity/:id`, `/api/resolvers`,
      `/api/teams` reads to unblock the frontends below
- [x] Website submission form (`apps/website`) — 3-step wizard per ADR-002
- [x] Resolver Console (`apps/resolver-console`) — queue/claim/reply/escalate/reassign/resolve
- [x] Outbox Worker (`apps/worker`) — polls `Message.deliveryStatus = PENDING`, stub
      `NotificationSender`, 24hr-window re-check at dispatch, elapsed-time retry/give-up
- [x] `packages/design-tokens` — Part C tokens, consumed by both frontends
- [x] Real category taxonomy (`packages/db/src/categoryTaxonomy.ts`) — reduced from
      `Updated_categories_for_new_grievance.xlsx` (Off-Roll, onroll, HR partners, SBI
      sheets), symptom-clubbed from ~83 raw rows to a real, scannable tree; see that
      file's header comment for the full methodology, what's real vs. synthetic
      (Harassment/Conduct and Sanction Status Check have no source row), and the known
      gaps (no TAT data in the source, no Role-enum value for HR-partner vendor staff)
- [ ] JWT auth + RLS enforcement (Part E step 8 — reuse from the CRM monorepo)
- [ ] Identity Service (Workline Full + Incremental sync)
- [ ] WhatsApp Middleware (Meta Cloud API direct — see spec Part D2b) — the worker's
      `NotificationSender` interface is ready to receive this
- [ ] Admin Console
- [ ] Real file upload / object storage for attachments (currently URL-only)

Meta Business Verification: not started as of Aug 28. WhatsApp integration will run in
Meta test mode (temporary number, confirmed recipients only) for the demo — production
rollout to the full workforce is gated on verification completing, which is outside this
timeline's control.
