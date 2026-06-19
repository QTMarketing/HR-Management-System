# HR SSO account linkage (CPS-aligned)

Staff Operations SSO resolves Hub users through `public.hub_account_links`, matching the CPS pattern shared by platform.

## Flow

```
Hub JWT (sub = Hub user id, email)
  → verify iss / aud / exp
  → lookup hub_account_links by hub_user_id
  → if linked: load employee, require status = active, create session
  → else: exact email on active employees
       → exactly one: auto-link + session
       → zero: sso_no_employee
       → many: sso_account_ambiguous
```

Roles stay in HR (`employees.role`, RBAC). Hub `role` in the JWT is not used for HR permissions.

## Migration

Apply `supabase/migrations/081_hub_account_links.sql` on HR Supabase (local + production).

## Smoke test

```bash
npx tsx scripts/sso-smoke-test.ts --base http://localhost:3001 --email admin@quicktrack.com
```

Requires `SSO_SHARED_SECRET` and an active `employees` row for the email when `RBAC_ENABLED=true`.

## Errors (login page)

| Code | Meaning |
|------|---------|
| `sso_no_employee` | No link and no single active employee for email |
| `sso_account_ambiguous` | Multiple active employees share the email |
| `sso_account_conflict` | Link insert blocked (employee already linked to another Hub user) |
| `sso_inactive_employee` | Linked employee is inactive |
