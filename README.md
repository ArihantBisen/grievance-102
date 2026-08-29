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
  whatsapp-client/   — Meta Cloud API client + logging stub, behind one NotificationSender
                       interface (ADR-003) — shared by apps/api's webhook receiver and
                       apps/worker's Outbox Worker
infra/               — Deployment config (pending hosting/data-residency decision)
```

## First-time setup

```bash
npm install
cp packages/db/.env.example packages/db/.env    # fill in real DATABASE_URL
cp .env.example .env                            # DATABASE_URL + PORT + JWT_SECRET, for apps/api
npm run db:generate
npm run db:migrate
npm run db:seed     # loads the real (symptom-clubbed) category taxonomy + test identities/resolvers
npm run dev:api     # starts the Ticketing Core API on :4000

npm run dev --workspace=apps/website           # :5173, needs ?identityId=<id> in the URL
npm run dev --workspace=apps/resolver-console  # :5174, login required
npm run dev --workspace=apps/admin-console     # :5175, admin login required
npm run dev --workspace=apps/worker            # polls the outbox, no port
```

Every seeded resolver (including the admin) logs in with password `sboss-dev-2026` —
dev/demo only, see `packages/db/src/seed.ts`. The admin account is `admin@sboss.example`;
a non-admin (e.g. `asha.rao@sboss.example`) can sign into the Resolver Console but is
rejected by the Admin Console's login screen.

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
PATCH  /api/categories/:id               admin: edit TAT / confidentiality / escalation contact
POST   /api/subcategories                admin: create subcategory
PATCH  /api/subcategories/:id            admin: edit roleVisibility / resolver team / TAT override

GET    /api/identity/:id                 read one identity's webform context (name/role/
                                          designation/circle/branch) — stand-in for the
                                          signed-link decode (ADR-002) until JWT-based
                                          citizen auth exists (JWT auth itself now
                                          exists, but only for the resolver/admin console)
GET    /api/resolvers                    list resolvers (?teamId=) — auth required
POST   /api/resolvers                    admin: create a resolver
PATCH  /api/resolvers/:id                admin: reassign team / grant-revoke admin
GET    /api/teams                        list teams — auth required
POST   /api/teams                        admin: create a team

POST   /api/auth/login                   resolver/admin login -> { token, resolver }
GET    /api/admin/identities             admin: list/filter identities
PATCH  /api/admin/identities/:id/role    admin: override role (ADR-006 D2a's roleClassifiedBy)
GET    /api/admin/unknown-contacts       admin: ADR-011's review log (?reviewed=)
PATCH  /api/admin/unknown-contacts/:id   admin: mark reviewed
GET    /api/admin/orphaned-tickets       admin: ADR-010's supervisor-reassignment queue
GET    /api/admin/sync-runs              admin: Workline SyncRun history

GET    /api/webhook/inbound              Meta's webhook subscription handshake (hub.challenge)
POST   /api/webhook/inbound              Meta calls this for inbound WhatsApp messages
```

Every ticket mutation writes an `AuditLog` row in the same transaction (append-only, per
the audit NFR). `isConfidential` on a created ticket is always derived from
`Category.isConfidential` (ADR-009), never client-supplied. A `RESOLVER` reply outside
WhatsApp's 24hr customer-service window is forced to `channelType: TEMPLATE` regardless
of what the caller requested (D2/D2b) — checked again at dispatch time by the Outbox
Worker in case a message sat PENDING long enough for the window to close.

**JWT auth + Postgres RLS (Part E step 8) are now built** — fresh, not ported: the CRM
monorepo the spec says to reuse this from wasn't locatable this session. `Resolver`
gained `passwordHash` + `isAdmin`; `POST /api/auth/login` issues an 8h JWT carrying
`{sub, email, name, teamId, isAdmin}`. `requireAuth`/`requireAdmin`
(`apps/api/src/middleware/auth.ts`) gate the resolver/admin-only routes above.
Real Postgres RLS (not just app-level filtering) is enabled with `FORCE ROW LEVEL
SECURITY` on `Ticket`/`Message`/`Attachment`/`AuditLog`
(`packages/db/prisma/migrations/.../add_row_level_security`), keyed off
`app.current_team_id`/`app.is_admin` session variables that
`apps/api/src/lib/rls.ts`'s `withRlsContext`/`withSystemRls` set per-request inside a
transaction. A resolver's session can only see their own team's rows; ADR-009's
confidentiality wall falls out of that for free, with no separate check, since a
confidential ticket's team is always the HR-Confidential-Committee team. Citizen-facing
routes (ticket creation, `/tickets/mine`, the category tree, the identity read) run
with the admin bypass (`withSystemRls`) since they have no resolver session to scope by.
The Outbox Worker also needs this bypass for its own queries — an easy bug to
reintroduce if a new query is added there without going through it (see
`apps/worker/src/dispatch.ts`'s comment).

**The WhatsApp Middleware (D2b) is now built too** — the webhook receiver above, plus
`packages/whatsapp-client` (`MetaCloudApiSender`, behind the same `NotificationSender`
interface the Outbox Worker already used its logging stub through — ADR-003's
reversibility pattern, now proven out: swapping in the real client took no changes to
either call site). `getNotificationSender()` picks the real Meta client automatically
once `META_ACCESS_TOKEN`/`META_PHONE_NUMBER_ID` are set, and falls back to the logging
stub otherwise — nothing breaks in dev without real credentials, which is the actual
state of this session (Business Verification was just starting when this was built).

`POST /api/webhook/inbound` verifies `X-Hub-Signature-256` against `META_APP_SECRET`
(skipped if unset, so local curl testing works without a real secret) and is idempotent
by construction: a new `InboundMessageDedup` row (keyed by Meta's `wamid`) is inserted
before any processing, inside the same transaction — a unique-constraint conflict means
"already handled," verified by literally redelivering an identical payload in testing
and confirming no duplicate `Message` row landed. Conversation routing, kept
deliberately minimal:
- Unknown phone number → `UnknownContact` upsert (ADR-011) + a polite decline reply, no
  ticket touched.
- A greeting, or the identity has no open tickets → a reply with the website submission
  link (`WEBSITE_BASE_URL/?identityId=<id>` — ADR-002's "entry point" flow; still the
  query-param stand-in for a real signed link, same as before).
- `"status"` → a short summary of open tickets (ADR-002 action item 2).
- Free text with exactly one open ticket → appended as a `USER` reply on it (stamps
  `lastInboundAt`, transitions `AWAITING_CUSTOMER` → `NEEDS_RESOLVER_INPUT`) — no
  immediate outbound send; the resolver picks it up from the console like any other
  reply.
- Free text with more than one open ticket → a short disambiguation prompt.

All of this runs under `withSystemRls`, same posture as ticket creation — there's no
resolver session on this path. Only `type: "text"` inbound messages are handled; media/
interactive message types are a documented gap, not silently dropped without a trace
(they're skipped with a code comment, not swallowed).

Still not built, on purpose: `/api/webform/*`, the phone-based `/api/identity/lookup` —
these depend on JWT-based citizen auth (the signed-link mechanism ADR-002 describes),
not in scope for this pass. The Identity Service (Workline sync) is also still not built.

## Frontends and worker built so far

- **`apps/website`** — the "Submit a Grievance" 3-step wizard (ADR-002): Grievance
  Details → Supporting Documents → Review. Reached via `/?identityId=<id>`, a stand-in
  for the signed submission link until JWT/webform-token auth exists. Supports both
  GRIEVANCE and REQUEST ticket types (the latter only offered to REQUEST-eligible
  roles). Attachments are collected as URLs — real file upload / object storage isn't
  wired up yet.
- **`apps/resolver-console`** — real JWT login now (was a team + "acting as" picker in
  the previous pass). Queue (filterable by status, with a green/amber/red TAT indicator
  per Part C, RLS-scoped to the logged-in resolver's own team — an admin gets a team
  filter dropdown since they bypass that scoping), ticket detail with thread, claim,
  reassign, reply, escalate, and resolve. `actor` on every mutation now comes from the
  verified JWT, not a client-supplied field.
- **`apps/admin-console`** — new this pass, admin-JWT-gated (ADR-004's "category tree,
  TAT policy, resolver/team mapping"). Four tabs: **Category Tree** (inline TAT-hours
  editing, confidentiality toggle, and an ADR-008 role-visibility matrix — click a role
  chip to toggle a subcategory's visibility for that role); **Resolvers & Teams** (add a
  resolver, reassign a resolver's team, grant/revoke admin); **Identities** (search/filter,
  inline role override per D2a, showing whether a role was sync- or admin-classified);
  **Ops** (ADR-010's orphaned-ticket/reassignment queue — populated via a seeded demo
  ticket so it's not empty on a fresh DB; ADR-011's unknown-contact review log and the
  Workline SyncRun history, both correctly empty until the Identity Service/WhatsApp
  Middleware exist to populate them).
- **`apps/worker`** — Outbox Worker. Polls `Message` rows with `deliveryStatus =
  PENDING` (that *is* the outbox queue — no separate table needed, the schema already
  models it this way) and dispatches through `packages/whatsapp-client`'s
  `NotificationSender` — the real Meta client if credentials are set, the logging stub
  otherwise. Re-applies the 24hr-window TEMPLATE check at dispatch time. Retries by
  simply leaving a failed message PENDING for the next poll cycle; gives up (marks
  `FAILED` + `deliveryError`) after 15 minutes of failures rather than a persisted
  attempt counter — a deliberate skeleton-scope simplification. Its own DB queries need
  the same RLS admin-bypass every other system route uses (`withSystemRls` /
  `set_config('app.is_admin', 'true', true)`) — this was missed once already (see the
  RLS section above), a bug worth remembering when touching this file.
- **`packages/design-tokens`** — Part C's color tokens as CSS variables + badge/table/
  card/SLA-dot component classes, consumed by all three frontends.
- **`packages/whatsapp-client`** — `MetaCloudApiSender` (real Meta Cloud API calls),
  `LoggingNotificationSender` (dev stub), `verifyMetaSignature` (HMAC-SHA256 for
  inbound webhooks), and `getNotificationSender()` (env-driven factory picking between
  the two). One outbound message shape carries both a ticket-attached reply/confirmation
  (worker) and a ticket-less exchange like a status-check reply (webhook handler) —
  `OutboundNotification.ticketId` is nullable for the latter.

All four were driven end-to-end with Playwright against a live local Postgres + API:
submit a grievance on the website → it lands in the resolver console's queue → sign in
→ claim → reply → escalate/resolve → the worker dispatches every outbound message and
marks it `SENT`, correctly skipping inbound `USER` messages and correctly promoting a
window-expired reply to `TEMPLATE` at dispatch time. Also verified directly against the
API: a resolver's session only ever returns their own team's tickets regardless of what
teamId they request (RLS, not just app-layer trust); a non-committee HR resolver and an
unrelated-department resolver both get 404 on a confidential ticket while the committee
resolver and an admin can see it; a non-admin gets 403 from every `/api/admin/*` route
and the Admin Console's own login screen; wrong password is rejected; an admin's
category-tree edits (TAT hours, role-visibility toggle) persist and are reflected back
through the citizen-facing `GET /api/categories`.

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
- [x] `packages/design-tokens` — Part C tokens, consumed by all three frontends
- [x] Real category taxonomy (`packages/db/src/categoryTaxonomy.ts`) — reduced from
      `Updated_categories_for_new_grievance.xlsx` (Off-Roll, onroll, HR partners, SBI
      sheets), symptom-clubbed from ~83 raw rows to a real, scannable tree; see that
      file's header comment for the full methodology, what's real vs. synthetic
      (Harassment/Conduct and Sanction Status Check have no source row), and the known
      gaps (no TAT data in the source, no Role-enum value for HR-partner vendor staff)
- [x] JWT auth + Postgres RLS (Part E step 8) — built fresh (no CRM monorepo was
      reachable this session to reuse it from, as the spec directs); real
      `FORCE ROW LEVEL SECURITY` policies, not app-layer filtering — see the section
      above and `packages/db/prisma/migrations/.../add_row_level_security`
- [x] Admin Console (`apps/admin-console`) — category tree/TAT/role-visibility editing,
      resolver/team mapping, identity role override, orphaned-ticket queue,
      unknown-contact review, sync-run history
- [x] WhatsApp Middleware (`packages/whatsapp-client` + `apps/api`'s webhook receiver —
      spec Part D2b) — real Meta Cloud API client + inbound webhook handler with
      signature verification and idempotent processing, behind the interface ADR-003
      specified; runs on the logging stub until real Meta credentials are set, no code
      changes needed to flip over
- [ ] Identity Service (Workline Full + Incremental sync)
- [ ] Real file upload / object storage for attachments (currently URL-only)
- [ ] TAT-breach scheduler (nothing sets `Ticket.breached` or fires `AUTO_TAT_BREACH`
      escalations yet — the SLA dots in both consoles are computed client-side, not
      backed by a real job)
- [ ] Monitoring endpoints (spec A4: webhook uptime, Outbox Worker queue depth, breached
      count, failed-dispatch count)
- [ ] Real resolver roster / real TAT hours / real per-vendor HR-partner routing —
      still placeholders pending sign-off from the relevant department heads

## Wiring up real Meta credentials

Once you have a permanent System User access token, a registered phone number ID, and
have started Business Verification:

1. Set `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_APP_SECRET` (App Settings →
   Basic → App Secret), and pick your own `META_WEBHOOK_VERIFY_TOKEN` in `.env`.
2. In Meta's dashboard (Step 2 → Configure Webhooks), set the Callback URL to
   `<your public API URL>/api/webhook/inbound` and the Verify Token to whatever you put
   in `META_WEBHOOK_VERIFY_TOKEN` above — Meta can't reach `localhost`, so this needs
   either a deployed API or a tunnel (e.g. `ngrok http 4000`) pointed at it.
3. Subscribe the webhook to the `messages` field.
4. Restart `apps/api` and `apps/worker` — `getNotificationSender()` picks up the real
   client automatically; no code changes needed.

### Draft message templates (D2b action item 4)

Not submittable from here — paste these into Meta's Message Templates page once the
WhatsApp product accepts submissions. `sboss_ticket_update` is the one this codebase
references by default (`META_DEFAULT_TEMPLATE_NAME`) for every TEMPLATE-path send
(outside the 24hr window) — submit at least that one first.

| Name | Category | Body |
|---|---|---|
| `sboss_ticket_update` | Utility | `{{1}}` — a single generic body-variable template used for any update outside the 24hr window (ticket-created confirmation, resolver follow-up, status change alike, per the single-`body`-string shape `Message` carries today) |
| `sboss_ticket_created` | Utility | Your grievance/request has been received. Reference: {{1}}. We'll update you here as it progresses. |
| `sboss_resolver_reply` | Utility | You have a new update on ticket {{1}}: {{2}} |

Meta Business Verification: started (as of this pass) — see the dashboard's Step 3.
Test-mode WhatsApp integration (temporary number, confirmed recipients only) works now;
production rollout to the full workforce is gated on verification completing.
