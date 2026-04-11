# MVP demo playbook

Use this profile for **stakeholder walkthroughs**: real UI against your Supabase project, without production hardening.

## 1. Environment (recommended)

Copy `.env.example` → `.env.local` and set at least:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL` (if you run Drizzle or probes)

**For demo, leave these off or set to `false`:**

| Variable | Demo value | Why |
|----------|------------|-----|
| `RBAC_ENABLED` | *(unset or not `true`)* | Everyone gets full permissions; no `/forbidden` on Publish, etc. |
| `NEXT_PUBLIC_AUTH_ENABLED` | *(unset)* | No forced login. Set to `true` to require sign-in (`lib/supabase/middleware.ts`). |

**Optional:**

- `NEXT_PUBLIC_USE_MOCK_DATA=true` — dashboard home uses mock KPIs/activity only. Use **`false`** (or unset) if you want the schedule board backed by real `shifts` in Supabase.
- `NEXT_PUBLIC_MVP_DEMO=true` — shows a top **“MVP demo”** ribbon in the dashboard shell (good for screen recordings).

Quick start with ribbon:

```bash
npm run dev:demo
```

## 2. Database

In Supabase SQL Editor (or CLI), run migrations **in order**:

`001` → … → **`013`** (`supabase/migrations/`).

Schedule + layers need **012** and **013**. If embeds fail, confirm **`employees!shifts_employee_id_fkey`** is used on the board query (already in code).

## 3. Demo flow (5–10 min)

1. `npm run dev` (or `npm run dev:demo`)
2. **Home** — KPIs, attendance card, **Weekly labor summary → View report** (`/reports/labor`), activity (toggle location in header).
3. **Schedule** → **Main schedule** → **week board** — layers, jobs, shift cards.
4. **Publish** — sets `is_published` on drafts for the visible week + location scope (works without RBAC; with RBAC needs `SCHEDULE_EDIT`).
5. **Users** / **Time clock** — optional, scope follows the same location cookie.

## 4. What “MVP demo” explicitly is *not*

- Production RLS review, tenant isolation, or audit trails.
- Removing dev-style **`anon`** policies — do that only for a real launch.

See **`HANDOFF.md`** for repo overview and follow-ups.
