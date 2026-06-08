# Session handoff (for the next chat / reopen)

**Last updated:** 2026-06-06  
**Remote:** `origin` → `https://github.com/QTMarketing/HR-Management-System.git`, branch **`main`** (tracks `origin/main`).  
**Local git:** Initial large commit + merge with GitHub’s earlier “Initial commit”; `.gitignore` merged (Next/Drizzle/`.venv` + Prisma DB patterns).

## What this app is

Connecteam-style **HR ops**: Next.js App Router, Supabase, RBAC (`lib/rbac`), location + time-clock scope via cookies (`hr_location_id`, `hr_time_clock_id`), all-locations aggregation mode.

## Supabase migrations (run in order)

`001`–`013` under `supabase/migrations/`. After the **Mar 26, 2026** baseline (through **`008`**):

- **`009_employees_directory_connecteam.sql`** — `employees` directory/admin fields, `archived` status, backfills.
- **`010_smart_groups.sql`** — segments, groups, members, admins, assignments (time clock / smart groups), RLS on new tables.
- **`011_employees_update_rls.sql`** — `employees` **UPDATE** for `authenticated` + `anon` (dev-friendly; tighten for prod).
- **`012_connecteam_schedule_jobs_groups.sql`** — schedule groups, jobs, `shift_assignments`, publish/slots/badge on `shifts`, RLS.
- **`013_schedule_shift_layers.sql`** — Connecteam-style **shift layers** (definitions, options, `shift_layer_values`), backfill + RLS.

Dashboard `sqlHint` in `app/(dashboard)/page.tsx` references **001 → 013**.

## Major features touched recently

- **Users → Groups:** `app/(dashboard)/users/groups/page.tsx`, `components/users/smart-groups-*.tsx`, `app/actions/smart-groups.ts`, `lib/smart-groups/load-data.ts`.
- **Time clock:** `lib/time-clock/smart-group-gate.ts` (group-based access).
- **Users directory:** promote admin + bulk add (`components/users/promote-admin-modal.tsx`, `add-users-bulk-modal.tsx`, `app/actions/users-directory.ts`).
- **Dashboard:** six KPI tiles + **Total attendance** pie on orange card (`components/dashboard/dashboard-kpi-strip.tsx`, `total-attendance-chart.tsx`); “Key metrics” header removed; KPI tiles right-aligned with truncation; operations snapshot / daily report blocks removed from home.
- **Schedule board:** week grid with layers + jobs (`/schedule/board`); PostgREST embed `employees!shifts_employee_id_fkey` (ambiguous without hint vs `shift_assignments`). **Publish** wired: `app/actions/schedule.ts` → `publishDraftShiftsForWeek` (`SCHEDULE_EDIT` when `RBAC_ENABLED=true`).
- **`app/globals.css`** — donut ring animation keyframes were removed when attendance became a pie.

## Env / behavior

- **`NEXT_PUBLIC_USE_MOCK_DATA`** — forces demo metrics/activity/staff on dashboard when `true`.
- Realtime on activity feed: disabled when mock, all-locations scope, or errors (see `ActivityFeedLive` usage on home page).

## Active plan (manager priorities)

| Item | Status | Notes |
|------|--------|-------|
| **PTO accrual automation** | **Implemented** (migration `079`) | `/pto-admin` → automation toggles, run history, cron `GET /api/cron/pto-automation` + `CRON_SECRET`. Apply migration + set `SUPABASE_SERVICE_ROLE_KEY`. |
| **Per-store payroll OT override** | **Implemented** | `/pto-admin` → store picker, save override, **Use global rules** to clear; `(override)` labels in dropdown. |
| **Hub HR PR / SSO consume** | In progress | Hub branches pushed; HR SSO consume route when merged. |

## Follow-ups (known)

- Harden **RLS** (`011`, **`012`/`013`**, smart groups, anon) for **production** — current setup targets dev/demo.
- Schedule: **templates**, drag-assign, in-app **layer/option admin** (today: SQL/migrations).
- Prefer **smaller commits** going forward so history reflects incremental work.

## MVP demo vs production (intent)

- By default the repo is tuned for **MVP demo** (no forced login in middleware, RBAC off unless `RBAC_ENABLED=true`).
- **Demo runbook:** `DEMO.md` — env checklist, migrations through **013**, optional `NEXT_PUBLIC_MVP_DEMO` ribbon, `npm run dev:demo`.
- **MVP / demo:** Stakeholders click through real flows; permissive RLS / `anon` policies and mock flags are acceptable; ops and edge cases can wait.
- **Production launch:** Tenant/role-scoped RLS, no broad `anon` write, auth expectations, observability, backups, audit of every policy before go-live.

## Portal / monorepo transfer

- **`docs/HR-TRANSFER-GUIDEBOOK.md`** — full guide: Vercel env copy (not git), monorepo `apps/hr-system`, Doppler alignment, Hub/SSO Phase 2.
- **`docs/DAILY-WORK-REPORT-TEMPLATE.md`** — same format as other app teams for guidebook comparison.
- **`docs/HR-HUB-CONNECTOR-SPEC-v1.md`** — QuickTrack Hub internal API + tool list (read-only v1).
- **`docs/doppler-hr.md`** — `hr-system` Doppler project + `npm run dev:doppler`.
- **`docs/INTEGRATION-READINESS.md`** — checklist for Hub/Doppler/monorepo.

## QuickTrack Hub integration (persistent — read every session)

**Two Cursor windows — do not mix without asking:**

| Window | Path | Git remote |
|--------|------|------------|
| HR (this repo) | `hr-management-system` | QTMarketing |
| Hub | `quicktrackhub` | sachit-99 → `feature/hr-embed` |

**Order:** HR stable → Hub connector (Track C) → monorepo embed (Track B). HR Supabase **never** merges into Hub Postgres.

**HR side done:** `/api/internal/assistant/*`, connector spec, Doppler prep, transfer docs.

**Hub side:** Phase 2 gateway on `feature/hr-phase2`; assistant connector on `feature/hr-embed` (pushed); SSO launch for `staff-operations` on `feature/hr-sso`. Hub AI connector = last priority per `HR-EMBED-PLAN.md`.

**Local ports:** Hub often `:3000` or `:3001`; HR uses the next free port (often `:3002` if Hub took `:3000`). Set Hub `HR_APP_URL` to the **exact** HR origin (check the “Open HR App” dev line on `/hr` and HR terminal). Wrong port sends you to Hub login, not HR. Shared key: `HR_INTERNAL_ASSISTANT_API_KEY` (HR) = `HR_APP_API_KEY` (Hub).

Cursor rule: `.cursor/rules/hub-integration-workflow.mdc` (always applied).

## For the AI in the next session

Say: *“Read `HANDOFF.md` and `.cursor/rules/hub-integration-workflow.mdc`.”* Chats do not reset project rules; this file is the human-readable snapshot.
