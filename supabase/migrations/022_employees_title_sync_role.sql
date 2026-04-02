-- Align legacy `title` with canonical Position (`role`) after app consolidation.

update public.employees
set title = role
where title is distinct from role;
