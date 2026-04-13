-- Link your local dev Auth user to an Org Owner employee (RBAC).
-- Prerequisite: Supabase Authentication → user with email dev@retailhr.local
-- (password shown on /login in next dev).
--
-- PostgreSQL UPDATE does not support LIMIT; this updates all rows matching Riley’s seed email.

UPDATE public.employees
SET
  email = 'dev@retailhr.local',
  role = 'Org Owner',
  status = 'active'
WHERE email ILIKE 'riley.k@example.com';

-- If UPDATE 0: list employees and set email/role on one row by id:
-- SELECT id, full_name, email, role FROM public.employees ORDER BY full_name;
-- UPDATE public.employees
-- SET email = 'dev@retailhr.local', role = 'Org Owner', status = 'active'
-- WHERE id = 'YOUR-UUID';
