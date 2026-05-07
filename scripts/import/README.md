## Import helpers (local-only)

These scripts are intended to be run **locally** against your exported CSVs. Do **not** commit CSVs or generated SQL to git.

### Generate multi-store assignments (`employee_location_assignments`)

1. Ensure the migration `supabase/migrations/050_employee_location_assignments.sql` has been applied to Supabase.
2. Keep your Connecteam export CSV **outside the repo** (ex: `~/Downloads/...`).
3. Generate SQL into `out/` (gitignored):

```bash
python3 scripts/import/employee_location_assignments_from_connecteam_csv.py \
  --csv "/Users/sachitghimire/Downloads/users (9)(Sheet1).csv" \
  --out "out/employee_location_assignments.sql"
```

4. Run the generated SQL in the **Supabase SQL editor**.

Notes:
- The generated SQL uses `employees.email` to find employees, and `locations.slug` / `locations.name` to find stores.
- Employees with **blank email** in the CSV are skipped.
- Re-running is safe: inserts use `on conflict ... do nothing`.

### Seed PTO opening balances (ledger)

This seeds go-live PTO balances into `public.pto_ledger_entries` as `opening_balance` rows by calling an owner-only RPC:
`public.pto_seed_opening_balances(jsonb)` (migration `058_pto_opening_balance_rpc.sql`).

1. Apply migrations:
   - `supabase/migrations/054_pto_ledger_and_policies.sql`
   - `supabase/migrations/055_pto_ledger_sync_from_time_off_records.sql`
   - `supabase/migrations/058_pto_opening_balance_rpc.sql`

2. Prepare a CSV **outside the repo** with columns:
   - `employee_id` (uuid)
   - `vacation_hours` (number)
   - `sick_hours` (number)
   - `effective_at` (optional ISO timestamp; if blank, defaults to now)

Example:

```csv
employee_id,vacation_hours,sick_hours,effective_at
11111111-1111-4111-8111-111111111111,40,0,2026-01-01T00:00:00Z
22222222-2222-4222-8222-222222222222,0,40,2026-01-01T00:00:00Z
```

3. Run the importer (requires Supabase service role key):

```bash
SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
npx tsx scripts/import/pto_opening_balances_from_csv.ts \
  --csv "/Users/you/Downloads/pto_opening_balances.csv"
```

4. Verify in Supabase:
   - `pto_ledger_entries` should have `entry_type = 'opening_balance'`
   - `pto_employee_balances` view should reflect the new balances

### Upsert employees directory (`employees`)

Use this when you have a **real roster CSV** (names + emails + home store) and the app still shows **demo** people in Time Clock / Users.

1. Prepare a CSV **outside the repo**. Required / common columns (headers are matched case-insensitively):

   - **email** (required)
   - **first_name** + **last_name**, *or* a single **full_name** column
   - One of: **location_id** (store uuid), **store_slug** (e.g. `store-118`), **store_name** (must match `locations.name`), or **store** / **store_number** with digits only (→ `store-{n}`)
   - Optional: **role**, **title**, **employment_start_date** (`YYYY-MM-DD`), **mobile_phone**, **birth_date**, **status** (`active` / `inactive` / `archived`), **employee_code**, **fte_ratio** (`0..1`)

2. Dry run (counts only, no writes):

```bash
SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
npx tsx scripts/import/employees_from_csv.ts \
  --csv "/Users/you/Downloads/employees.csv" \
  --dry-run
```

3. Apply for real:

```bash
SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
npx tsx scripts/import/employees_from_csv.ts \
  --csv "/Users/you/Downloads/employees.csv"
```

4. Verify in Supabase **Table Editor** → `employees` (names/emails/locations), then refresh the app.

Notes:
- Matches existing people by **email** (case-insensitive) and **updates** them; otherwise **inserts** a new row.
- Rows without a resolvable store are **skipped** (check `store_slug` / `locations.slug` alignment).
- Stdout prints **aggregate counts only** (no PII).

**Connecteam user export** (e.g. `First name`, `Last name`, `Email`, `Store`, `Groups`, …): headers normalize automatically (`First name` → `first_name`). **Store** may list multiple values separated by commas; the importer tries each segment until one matches a location **slug** (`store-101`) or **name** (`HQ`, `Lama Wholesale`). If **Store** is empty, the first 2–4 digit token in **Groups** (e.g. `102`) is tried as `store-{n}`. **Employment Start Date** and **Birthday** in `M/D/YYYY` are converted to `YYYY-MM-DD`. **Kiosk code** maps to `kiosk_code`. **Position** is used for `role` when present; **Title** for `title` (with sensible fallbacks).

### Enrich employees from curated Connecteam CSV folder

If you created a folder of “Employee Name → value” CSVs (email, store, phone, birthday, start date, kiosk code, etc.), you can import them in one pass.

1. Ensure migrations include `061_employees_connecteam_date_added.sql` (adds `employees.connecteam_date_added`).

2. Dry run:

```bash
cd /Users/you/path/to/hr-management-system
npx tsx scripts/import/employees_enrich_from_connecteam_folder.ts \
  --dir "/Users/you/Downloads/employee_store_overrides 2" \
  --dry-run
```

3. Apply for real:

```bash
cd /Users/you/path/to/hr-management-system
npx tsx scripts/import/employees_enrich_from_connecteam_folder.ts \
  --dir "/Users/you/Downloads/employee_store_overrides 2"
```

Notes:
- Your CSVs may include a title line like `Email Data - Assigned`; the importer ignores it automatically.
- This importer uses `employee_email_data.csv` as the source of truth to match records by **email** (more reliable than name-only matching).


