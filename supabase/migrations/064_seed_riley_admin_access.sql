-- Dev seed: ensure the demo/test account (Riley K.) has full Store Manager access.
-- Keep role as Store Manager so cross-store pages remain view-only per location scoping.

update public.employees
set
  role = 'Store Manager',
  admin_access = null,
  permissions_label = 'All features'
where email = 'riley.k@example.com';

