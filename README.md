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
npm run db:generate
npm run db:migrate
npm run db:seed     # loads placeholder category data — see seed.ts header for what's real vs placeholder
```

## Status (Aug 28)

- [x] Monorepo scaffolded
- [x] Prisma schema in place (13 models, 13 enums — matches spec Part D1 exactly)
- [x] Seed script skeleton (structure real, category content placeholder)
- [ ] Real category taxonomy (from `Updated_categories_for_new_grievance.xlsx`, reduced per
      the symptom-clubbing rules — not a raw import)
- [ ] Ticketing Core API
- [ ] Identity Service (Workline Full + Incremental sync)
- [ ] WhatsApp Middleware (Meta Cloud API direct — see spec Part D2b)
- [ ] Resolver Console
- [ ] Website submission form
- [ ] Outbox Worker

Meta Business Verification: not started as of Aug 28. WhatsApp integration will run in
Meta test mode (temporary number, confirmed recipients only) for the demo — production
rollout to the full workforce is gated on verification completing, which is outside this
timeline's control.
