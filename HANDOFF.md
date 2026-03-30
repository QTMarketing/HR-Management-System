# Session handoff (for the next chat / reopen)

**Last updated:** 2026-03-30  
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

## Follow-ups (known)

- Harden **RLS** (`011`, **`012`/`013`**, smart groups, anon) for **production** — current setup targets dev/demo.
- Schedule: **templates**, drag-assign, in-app **layer/option admin** (today: SQL/migrations).
- Prefer **smaller commits** going forward so history reflects incremental work.

## MVP demo vs production (intent)

- By default the repo is tuned for **MVP demo** (no forced login in middleware, RBAC off unless `RBAC_ENABLED=true`).
- **Demo runbook:** `DEMO.md` — env checklist, migrations through **013**, optional `NEXT_PUBLIC_MVP_DEMO` ribbon, `npm run dev:demo`.
- **MVP / demo:** Stakeholders click through real flows; permissive RLS / `anon` policies and mock flags are acceptable; ops and edge cases can wait.
- **Production launch:** Tenant/role-scoped RLS, no broad `anon` write, auth expectations, observability, backups, audit of every policy before go-live.

## For the AI in the next session

Say: *“Read `HANDOFF.md` and continue from there.”* Chats do not persist after closing the app; this file is the durable snapshot.
