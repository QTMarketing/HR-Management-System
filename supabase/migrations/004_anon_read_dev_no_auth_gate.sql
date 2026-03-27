-- Run in Supabase SQL Editor while auth is disabled on the app.
-- Allows the anon key (no signed-in user) to read dashboard tables again.
-- Re-enable strict auth later by dropping these policies (see 003).

drop policy if exists "locations_select_anon" on public.locations;
create policy "locations_select_anon"
  on public.locations for select to anon using (true);

drop policy if exists "dashboard_metrics_select_anon" on public.dashboard_location_metrics;
create policy "dashboard_metrics_select_anon"
  on public.dashboard_location_metrics for select to anon using (true);

drop policy if exists "employees_select_anon" on public.employees;
create policy "employees_select_anon"
  on public.employees for select to anon using (true);

drop policy if exists "activity_events_select_anon" on public.activity_events;
create policy "activity_events_select_anon"
  on public.activity_events for select to anon using (true);

drop policy if exists "attendance_trend_select_anon" on public.attendance_trend_points;
create policy "attendance_trend_select_anon"
  on public.attendance_trend_points for select to anon using (true);

drop policy if exists "staff_updates_select_anon" on public.staff_updates;
create policy "staff_updates_select_anon"
  on public.staff_updates for select to anon using (true);
