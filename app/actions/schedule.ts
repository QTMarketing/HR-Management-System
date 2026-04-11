"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { addDays, parseWeekMondayParam } from "@/lib/schedule/week";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublishScheduleResult = { ok: true } | { ok: false; error: string };

export type ScheduleMutationResult = { ok: true } | { ok: false; error: string };

async function anyUnavailabilityOverlap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: { employeeIds: string[]; locationId: string; startIso: string; endIso: string },
): Promise<boolean> {
  if (input.employeeIds.length === 0) return false;
  try {
    const q = supabase
      .from("employee_unavailability")
      .select("id")
      .eq("location_id", input.locationId)
      .in("employee_id", input.employeeIds)
      .lt("start_at", input.endIso)
      .gt("end_at", input.startIso)
      .limit(1);
    const { data, error } = await q;
    if (error) return false; // If table/migration isn't present yet, don't break schedule.
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/** True if any of `employeeIds` already has a planned shift overlapping [startIso, endIso) at this store. */
async function anyShiftTimeOverlap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: {
    employeeIds: string[];
    locationId: string;
    startIso: string;
    endIso: string;
    excludeShiftId?: string;
  },
): Promise<boolean> {
  if (input.employeeIds.length === 0) return false;
  try {
    const { data, error } = await supabase
      .from("shifts")
      .select("id, employee_id, shift_assignments(employee_id)")
      .eq("location_id", input.locationId)
      .lt("shift_start", input.endIso)
      .gt("shift_end", input.startIso);
    if (error) return false;
    const want = new Set(input.employeeIds);
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        employee_id: string;
        shift_assignments: { employee_id: string }[] | null;
      };
      if (input.excludeShiftId && r.id === input.excludeShiftId) continue;
      const onShift = new Set<string>();
      onShift.add(r.employee_id);
      for (const sa of r.shift_assignments ?? []) {
        if (sa?.employee_id) onShift.add(sa.employee_id);
      }
      for (const eid of want) {
        if (onShift.has(eid)) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Overlap with an existing employee_unavailability row (same employee + store). */
async function anyUnavailabilityBlockOverlap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: { employeeId: string; locationId: string; startIso: string; endIso: string },
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("employee_unavailability")
      .select("id")
      .eq("employee_id", input.employeeId)
      .eq("location_id", input.locationId)
      .lt("start_at", input.endIso)
      .gt("end_at", input.startIso)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

async function loadScheduleLocationScope(supabase: Awaited<
  ReturnType<typeof createSupabaseServerClient>
>) {
  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);
  const cookieStore = await cookies();
  const resolvedId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(resolvedId);
  const allowedLocationIds = new Set(locations.map((l) => l.id));
  return { scopeAll, resolvedLocationId: resolvedId, allowedLocationIds, locations };
}

async function assertCanEditScheduleForLocation(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ctx: Awaited<ReturnType<typeof getRbacContext>>,
  locationId: string,
): Promise<ScheduleMutationResult | null> {
  if (!ctx.enabled) return null;
  if (!hasPermission(ctx, PERMISSIONS.SCHEDULE_EDIT)) {
    return { ok: false, error: "You don’t have permission to edit the schedule." };
  }
  if (ctx.roleKey === "owner") return null;
  if (!ctx.employeeId) {
    return { ok: false, error: "Missing employee profile for permission checks." };
  }
  const { data: loc, error } = await supabase
    .from("locations")
    .select("manager_employee_id")
    .eq("id", locationId)
    .maybeSingle();
  if (error || !loc) {
    return { ok: false, error: "Location not found." };
  }
  const managerId =
    (loc as { manager_employee_id?: string | null }).manager_employee_id ?? null;
  if (managerId !== ctx.employeeId) {
    return { ok: false, error: "You can only edit schedules for your store." };
  }
  return null;
}

/** Create a planned shift (employee must belong to the chosen store). */
export async function createShift(input: {
  employeeIds: string[];
  locationId: string;
  jobId: string;
  shiftStartIso: string;
  shiftEndIso: string;
  notes?: string | null;
  /** Defaults to true so new shifts appear without an extra publish step. */
  isPublished?: boolean;
}): Promise<ScheduleMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  const denied = await assertCanEditScheduleForLocation(supabase, ctx, input.locationId);
  if (denied) return denied;

  const { scopeAll, resolvedLocationId, allowedLocationIds } =
    await loadScheduleLocationScope(supabase);

  if (!allowedLocationIds.has(input.locationId)) {
    return { ok: false, error: "Invalid location." };
  }
  if (!input.jobId?.trim()) {
    return { ok: false, error: "Job is required." };
  }
  const { data: job, error: jobErr } = await supabase
    .from("schedule_jobs")
    .select("id, location_id")
    .eq("id", input.jobId)
    .maybeSingle();
  if (jobErr || !job) return { ok: false, error: "Job not found." };
  if ((job as { location_id: string }).location_id !== input.locationId) {
    return { ok: false, error: "Job does not belong to this store." };
  }
  if (!scopeAll && input.locationId !== resolvedLocationId) {
    return { ok: false, error: "Location does not match your header scope." };
  }

  const start = new Date(input.shiftStartIso);
  const end = new Date(input.shiftEndIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "Invalid start or end time." };
  }
  if (end <= start) {
    return { ok: false, error: "Shift must end after it starts." };
  }

  const uniqEmployeeIds = [...new Set(input.employeeIds.filter(Boolean))];
  if (uniqEmployeeIds.length === 0) {
    return { ok: false, error: "Select at least one employee." };
  }

  const overlapsUnavailability = await anyUnavailabilityOverlap(supabase, {
    employeeIds: uniqEmployeeIds,
    locationId: input.locationId,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  });
  if (overlapsUnavailability) {
    return { ok: false, error: "One or more selected employees are unavailable during this time." };
  }

  const overlapsShift = await anyShiftTimeOverlap(supabase, {
    employeeIds: uniqEmployeeIds,
    locationId: input.locationId,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  });
  if (overlapsShift) {
    return {
      ok: false,
      error: "One or more selected employees already have another shift overlapping this time.",
    };
  }

  const { data: emps, error: empErr } = await supabase
    .from("employees")
    .select("id, location_id, status")
    .in("id", uniqEmployeeIds);

  if (empErr) {
    return { ok: false, error: empErr.message };
  }
  const found = new Map((emps ?? []).map((e) => [e.id as string, e] as const));
  for (const eid of uniqEmployeeIds) {
    const e = found.get(eid) as { location_id: string; status?: string } | undefined;
    if (!e) return { ok: false, error: "Employee not found." };
    if (e.status && e.status !== "active") {
      return { ok: false, error: "One or more selected employees are not active." };
    }
    if (e.location_id !== input.locationId) {
      return { ok: false, error: "All selected employees must belong to this store." };
    }
  }

  const primaryEmployeeId = uniqEmployeeIds[0];
  const { data: inserted, error } = await supabase
    .from("shifts")
    .insert({
      employee_id: primaryEmployeeId,
    location_id: input.locationId,
    job_id: input.jobId,
    shift_start: start.toISOString(),
    shift_end: end.toISOString(),
    notes: input.notes?.trim() ? input.notes.trim() : null,
    is_published: input.isPublished !== false,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  const shiftId = (inserted as { id?: string } | null)?.id;
  if (shiftId) {
    const rows = uniqEmployeeIds.map((employeeId) => ({ shift_id: shiftId, employee_id: employeeId }));
    const { error: assignErr } = await supabase.from("shift_assignments").insert(rows);
    if (assignErr) {
      return { ok: false, error: assignErr.message };
    }
  }

  revalidatePath("/schedule/board");
  revalidatePath("/schedule");
  return { ok: true };
}

/** Remove a shift if it is visible under the current location scope. */
export async function deleteShift(input: { shiftId: string }): Promise<ScheduleMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);

  const { scopeAll, resolvedLocationId, allowedLocationIds } =
    await loadScheduleLocationScope(supabase);

  const { data: shift, error: fetchErr } = await supabase
    .from("shifts")
    .select("id, location_id")
    .eq("id", input.shiftId)
    .maybeSingle();

  if (fetchErr || !shift) {
    return { ok: false, error: "Shift not found." };
  }
  const locId = (shift as { location_id: string }).location_id;
  const denied = await assertCanEditScheduleForLocation(supabase, ctx, locId);
  if (denied) return denied;
  if (!allowedLocationIds.has(locId)) {
    return { ok: false, error: "Invalid location." };
  }
  if (!scopeAll && locId !== resolvedLocationId) {
    return { ok: false, error: "You can’t delete a shift outside your header scope." };
  }

  const { error } = await supabase.from("shifts").delete().eq("id", input.shiftId);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/schedule/board");
  revalidatePath("/schedule");
  return { ok: true };
}

/** Update a shift’s core fields (employee/location/times/notes). */
export async function updateShift(input: {
  shiftId: string;
  employeeIds: string[];
  locationId: string;
  jobId: string;
  shiftStartIso: string;
  shiftEndIso: string;
  notes?: string | null;
  isPublished?: boolean;
}): Promise<ScheduleMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  const deniedForTarget = await assertCanEditScheduleForLocation(supabase, ctx, input.locationId);
  if (deniedForTarget) return deniedForTarget;

  const { scopeAll, resolvedLocationId, allowedLocationIds } =
    await loadScheduleLocationScope(supabase);

  if (!allowedLocationIds.has(input.locationId)) {
    return { ok: false, error: "Invalid location." };
  }
  if (!input.jobId?.trim()) {
    return { ok: false, error: "Job is required." };
  }
  const { data: job, error: jobErr } = await supabase
    .from("schedule_jobs")
    .select("id, location_id")
    .eq("id", input.jobId)
    .maybeSingle();
  if (jobErr || !job) return { ok: false, error: "Job not found." };
  if ((job as { location_id: string }).location_id !== input.locationId) {
    return { ok: false, error: "Job does not belong to this store." };
  }
  if (!scopeAll && input.locationId !== resolvedLocationId) {
    return { ok: false, error: "Location does not match your header scope." };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("shifts")
    .select("id, location_id")
    .eq("id", input.shiftId)
    .maybeSingle();
  if (existingErr || !existing) {
    return { ok: false, error: "Shift not found." };
  }
  const existingLocId = (existing as { location_id: string }).location_id;
  const deniedForExisting = await assertCanEditScheduleForLocation(supabase, ctx, existingLocId);
  if (deniedForExisting) return deniedForExisting;
  if (!allowedLocationIds.has(existingLocId)) {
    return { ok: false, error: "Invalid location." };
  }
  if (!scopeAll && existingLocId !== resolvedLocationId) {
    return { ok: false, error: "You can’t edit a shift outside your header scope." };
  }

  const start = new Date(input.shiftStartIso);
  const end = new Date(input.shiftEndIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "Invalid start or end time." };
  }
  if (end <= start) {
    return { ok: false, error: "Shift must end after it starts." };
  }

  const uniqEmployeeIds = [...new Set(input.employeeIds.filter(Boolean))];
  if (uniqEmployeeIds.length === 0) {
    return { ok: false, error: "Select at least one employee." };
  }

  const overlapsUnavailability = await anyUnavailabilityOverlap(supabase, {
    employeeIds: uniqEmployeeIds,
    locationId: input.locationId,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  });
  if (overlapsUnavailability) {
    return { ok: false, error: "One or more selected employees are unavailable during this time." };
  }

  const overlapsShift = await anyShiftTimeOverlap(supabase, {
    employeeIds: uniqEmployeeIds,
    locationId: input.locationId,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    excludeShiftId: input.shiftId,
  });
  if (overlapsShift) {
    return {
      ok: false,
      error: "One or more selected employees already have another shift overlapping this time.",
    };
  }

  const { data: emps, error: empErr } = await supabase
    .from("employees")
    .select("id, location_id, status")
    .in("id", uniqEmployeeIds);
  if (empErr) {
    return { ok: false, error: empErr.message };
  }
  const found = new Map((emps ?? []).map((e) => [e.id as string, e] as const));
  for (const eid of uniqEmployeeIds) {
    const e = found.get(eid) as { location_id: string; status?: string } | undefined;
    if (!e) return { ok: false, error: "Employee not found." };
    if (e.status && e.status !== "active") {
      return { ok: false, error: "One or more selected employees are not active." };
    }
    if (e.location_id !== input.locationId) {
      return { ok: false, error: "All selected employees must belong to this store." };
    }
  }
  const primaryEmployeeId = uniqEmployeeIds[0];

  const { error } = await supabase
    .from("shifts")
    .update({
      employee_id: primaryEmployeeId,
      location_id: input.locationId,
      job_id: input.jobId,
      shift_start: start.toISOString(),
      shift_end: end.toISOString(),
      notes: input.notes?.trim() ? input.notes.trim() : null,
      ...(typeof input.isPublished === "boolean" ? { is_published: input.isPublished } : {}),
    })
    .eq("id", input.shiftId);

  if (error) {
    return { ok: false, error: error.message };
  }

  // Replace assignments (simple strategy for MVP).
  const { error: delErr } = await supabase
    .from("shift_assignments")
    .delete()
    .eq("shift_id", input.shiftId);
  if (delErr) {
    return { ok: false, error: delErr.message };
  }
  const rows = uniqEmployeeIds.map((employeeId) => ({ shift_id: input.shiftId, employee_id: employeeId }));
  const { error: insErr } = await supabase.from("shift_assignments").insert(rows);
  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/schedule/board");
  revalidatePath("/schedule");
  return { ok: true };
}

/** Set `is_published = true` for draft shifts in the visible week and location scope. */
export async function publishDraftShiftsForWeek(
  weekParam: string | undefined,
): Promise<PublishScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (ctx.enabled && !hasPermission(ctx, PERMISSIONS.SCHEDULE_EDIT)) {
    return { ok: false, error: "You don’t have permission to publish the schedule." };
  }

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);

  const weekMonday = parseWeekMondayParam(weekParam);
  const weekEnd = addDays(weekMonday, 7);

  let q = supabase
    .from("shifts")
    .update({ is_published: true })
    .eq("is_published", false)
    .gte("shift_start", weekMonday.toISOString())
    .lt("shift_start", weekEnd.toISOString());

  if (!scopeAll) {
    q = q.eq("location_id", locationId);
  }

  const { error } = await q;
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/schedule/board");
  revalidatePath("/schedule");
  return { ok: true };
}

export type AutoAssignJobsResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

/** Backfill missing `job_id` for shifts in the visible week/scope (mock/demo helper). */
export async function autoAssignJobsForWeek(
  weekParam: string | undefined,
): Promise<AutoAssignJobsResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) rawLocations = DEMO_LOCATIONS;
  const locations = locationsForSession(rawLocations);

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);

  const weekMonday = parseWeekMondayParam(weekParam);
  const weekEnd = addDays(weekMonday, 7);

  // Collect shifts missing job_id, with employee role hint.
  let q = supabase
    .from("shifts")
    .select("id, location_id, employee_id, employees!shifts_employee_id_fkey ( role )")
    .is("job_id", null)
    .gte("shift_start", weekMonday.toISOString())
    .lt("shift_start", weekEnd.toISOString());
  if (!scopeAll) q = q.eq("location_id", locationId);

  const { data: shiftRows, error: shiftErr } = await q;
  if (shiftErr) return { ok: false, error: shiftErr.message };
  const shifts = (shiftRows ?? []) as {
    id: string;
    location_id: string;
    employee_id: string;
    employees: unknown;
  }[];
  if (shifts.length === 0) return { ok: true, updated: 0 };

  // Fetch jobs per location.
  const locIds = [...new Set(shifts.map((s) => s.location_id))];
  const { data: jobRows, error: jobErr } = await supabase
    .from("schedule_jobs")
    .select("id, location_id, name, sort_order")
    .in("location_id", locIds)
    .order("sort_order", { ascending: true });
  if (jobErr) return { ok: false, error: jobErr.message };

  const jobsByLoc = new Map<string, { id: string; name: string }[]>();
  for (const r of (jobRows ?? []) as { id: string; location_id: string; name: string }[]) {
    if (!jobsByLoc.has(r.location_id)) jobsByLoc.set(r.location_id, []);
    jobsByLoc.get(r.location_id)!.push({ id: r.id, name: r.name });
  }

  function pickRoleHint(raw: unknown): string {
    const emp = Array.isArray(raw) ? raw[0] : raw;
    if (!emp || typeof emp !== "object") return "";
    const role = (emp as { role?: string }).role;
    return typeof role === "string" ? role.toLowerCase() : "";
  }

  // Decide job assignment per shift.
  const updatesByJob = new Map<string, string[]>();
  for (const s of shifts) {
    const jobs = jobsByLoc.get(s.location_id) ?? [];
    if (jobs.length === 0) continue;
    const role = pickRoleHint(s.employees);
    const preferredName =
      role.includes("manager") || role.includes("lead")
        ? "Shift manager"
        : role.includes("server")
          ? "Server"
          : role.includes("bartender")
            ? "Bartender"
            : null;
    const picked =
      (preferredName ? jobs.find((j) => j.name === preferredName) : null) ?? jobs[0];
    if (!picked) continue;
    if (!updatesByJob.has(picked.id)) updatesByJob.set(picked.id, []);
    updatesByJob.get(picked.id)!.push(s.id);
  }

  // Enforce per-store manager edit rule: if scoped to one store, require manager/owner.
  if (!scopeAll) {
    const denied = await assertCanEditScheduleForLocation(supabase, ctx, locationId);
    if (denied && !denied.ok) return { ok: false, error: denied.error };
  } else if (ctx.enabled && ctx.roleKey !== "owner") {
    return { ok: false, error: "Switch to a specific store to run this fix." };
  }

  let updated = 0;
  for (const [jobId, ids] of updatesByJob.entries()) {
    if (ids.length === 0) continue;
    const { error } = await supabase.from("shifts").update({ job_id: jobId }).in("id", ids);
    if (error) return { ok: false, error: error.message };
    updated += ids.length;
  }

  revalidatePath("/schedule/board");
  revalidatePath("/schedule");
  return { ok: true, updated };
}

export type SeedDemoWeekResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string };

/** Create demo shifts for the visible week/scope when schedule is empty (demo helper). */
export async function seedDemoShiftsForWeek(
  weekParam: string | undefined,
): Promise<SeedDemoWeekResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) rawLocations = DEMO_LOCATIONS;
  const locations = locationsForSession(rawLocations);

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);

  // For safety: only owners can seed across all locations.
  if (scopeAll) {
    if (ctx.enabled && ctx.roleKey !== "owner") {
      return { ok: false, error: "Switch to a specific store to generate demo shifts." };
    }
  } else {
    const denied = await assertCanEditScheduleForLocation(supabase, ctx, locationId);
    if (denied) return denied.ok ? { ok: false, error: "Permission denied." } : denied;
  }

  const weekMonday = parseWeekMondayParam(weekParam);
  const weekEnd = addDays(weekMonday, 7);

  // Pick employees in scope.
  let empQ = supabase
    .from("employees")
    .select("id, location_id")
    .eq("status", "active");
  if (!scopeAll) empQ = empQ.eq("location_id", locationId);
  const { data: empRows, error: empErr } = await empQ;
  if (empErr) return { ok: false, error: empErr.message };
  const emps = (empRows ?? []) as { id: string; location_id: string }[];
  if (emps.length === 0) return { ok: true, inserted: 0 };

  // Pick a default job per location (first sort order).
  const locIds = [...new Set(emps.map((e) => e.location_id))];
  const { data: jobRows, error: jobErr } = await supabase
    .from("schedule_jobs")
    .select("id, location_id, sort_order")
    .in("location_id", locIds)
    .order("sort_order", { ascending: true });
  if (jobErr) return { ok: false, error: jobErr.message };
  const firstJobByLoc = new Map<string, string>();
  for (const r of (jobRows ?? []) as { id: string; location_id: string }[]) {
    if (!firstJobByLoc.has(r.location_id)) firstJobByLoc.set(r.location_id, r.id);
  }

  // Load existing shifts so we don't duplicate.
  type ExistingShiftRow = { employee_id: string; shift_start: string };
  let existingQ = supabase
    .from("shifts")
    .select("employee_id, shift_start")
    .gte("shift_start", weekMonday.toISOString())
    .lt("shift_start", weekEnd.toISOString());
  if (!scopeAll) existingQ = existingQ.eq("location_id", locationId);
  const { data: existingRows, error: existingErr } = await existingQ;
  if (existingErr) return { ok: false, error: existingErr.message };
  const existingKey = new Set(
    ((existingRows ?? []) as ExistingShiftRow[]).map(
      (r) => `${r.employee_id}:${String(r.shift_start).slice(0, 10)}`,
    ),
  );

  const inserts: {
    employee_id: string;
    location_id: string;
    job_id: string;
    shift_start: string;
    shift_end: string;
    notes: string | null;
    is_published: boolean;
  }[] = [];

  for (const e of emps) {
    const jobId = firstJobByLoc.get(e.location_id);
    if (!jobId) continue;
    for (let d = 0; d < 7; d++) {
      // Seed weekdays only (Mon–Fri).
      const day = addDays(weekMonday, d);
      const dow = day.getDay();
      if (dow === 0 || dow === 6) continue;
      const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const key = `${e.id}:${ymd}`;
      if (existingKey.has(key)) continue;

      const start = new Date(day);
      start.setHours(9, 0, 0, 0);
      const end = new Date(day);
      end.setHours(17, 0, 0, 0);
      inserts.push({
        employee_id: e.id,
        location_id: e.location_id,
        job_id: jobId,
        shift_start: start.toISOString(),
        shift_end: end.toISOString(),
        notes: "Demo shift",
        is_published: false,
      });
    }
  }

  if (inserts.length === 0) return { ok: true, inserted: 0 };
  const { error: insErr, data: inserted } = await supabase
    .from("shifts")
    .insert(inserts)
    .select("id");
  if (insErr) return { ok: false, error: insErr.message };

  // Ensure assignments mirror employee_id.
  const newIds = ((inserted ?? []) as { id: string }[]).map((r) => r.id);
  if (newIds.length > 0) {
    type InsertedShiftRow = { id: string; employee_id: string };
    const { data: shRows } = await supabase
      .from("shifts")
      .select("id, employee_id")
      .in("id", newIds);
    const rows = ((shRows ?? []) as InsertedShiftRow[]).map((r) => ({
      shift_id: r.id,
      employee_id: r.employee_id,
    }));
    if (rows.length) {
      await supabase.from("shift_assignments").insert(rows);
    }
  }

  revalidatePath("/schedule/board");
  revalidatePath("/schedule");
  return { ok: true, inserted: inserts.length };
}

export type ShiftTasksResult =
  | {
      ok: true;
      tasks: {
        id: string;
        title: string;
        is_completed: boolean;
        sort_order: number;
        completed_at: string | null;
        completed_by_employee_id: string | null;
        created_at: string;
      }[];
    }
  | { ok: false; error: string };

export async function listShiftTasks(shiftId: string): Promise<ShiftTasksResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shift_tasks")
    .select("id, title, is_completed, sort_order, completed_at, completed_by_employee_id, created_at")
    .eq("shift_id", shiftId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    tasks: (data ?? []) as {
      id: string;
      title: string;
      is_completed: boolean;
      sort_order: number;
      completed_at: string | null;
      completed_by_employee_id: string | null;
      created_at: string;
    }[],
  };
}

export async function addShiftTask(input: {
  shiftId: string;
  title: string;
}): Promise<ScheduleMutationResult> {
  const supabase = await createSupabaseServerClient();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required." };

  // Append to end of the list (stable ordering).
  const { data: lastRow, error: lastErr } = await supabase
    .from("shift_tasks")
    .select("sort_order")
    .eq("shift_id", input.shiftId)
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = lastErr ? 0 : Number((lastRow as { sort_order?: number } | null)?.sort_order ?? 0);
  const nextSort = Number.isFinite(last) ? last + 1 : 0;

  const { error } = await supabase
    .from("shift_tasks")
    .insert({ shift_id: input.shiftId, title, is_completed: false, sort_order: nextSort });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/schedule/board");
  return { ok: true };
}

export async function toggleShiftTask(input: {
  taskId: string;
  isCompleted: boolean;
}): Promise<ScheduleMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  const completedBy = ctx.employeeId ?? null;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("shift_tasks")
    .update(
      input.isCompleted
        ? { is_completed: true, completed_at: now, completed_by_employee_id: completedBy }
        : { is_completed: false, completed_at: null, completed_by_employee_id: null },
    )
    .eq("id", input.taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/schedule/board");
  return { ok: true };
}

export async function deleteShiftTask(taskId: string): Promise<ScheduleMutationResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("shift_tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/schedule/board");
  return { ok: true };
}

export type UnavailabilityResult = { ok: true } | { ok: false; error: string };

export async function createUnavailability(input: {
  employeeId: string;
  locationId: string;
  startAtIso: string;
  endAtIso: string;
  reason?: string | null;
}): Promise<UnavailabilityResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  const denied = await assertCanEditScheduleForLocation(supabase, ctx, input.locationId);
  if (denied) return denied;

  const start = new Date(input.startAtIso);
  const end = new Date(input.endAtIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "Invalid unavailability times." };
  }

  // Ensure employee belongs to location.
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, location_id, status")
    .eq("id", input.employeeId)
    .maybeSingle();
  if (empErr || !emp) return { ok: false, error: "Employee not found." };
  const e = emp as { location_id: string; status?: string };
  if (e.status && e.status !== "active") return { ok: false, error: "Employee is not active." };
  if (e.location_id !== input.locationId) return { ok: false, error: "Employee does not belong to this store." };

  const overlapsExistingUnavail = await anyUnavailabilityBlockOverlap(supabase, {
    employeeId: input.employeeId,
    locationId: input.locationId,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  });
  if (overlapsExistingUnavail) {
    return {
      ok: false,
      error: "An unavailability block already exists that overlaps this time.",
    };
  }

  const overlapsShift = await anyShiftTimeOverlap(supabase, {
    employeeIds: [input.employeeId],
    locationId: input.locationId,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  });
  if (overlapsShift) {
    return {
      ok: false,
      error: "This employee is already scheduled during this time. Remove or shorten the shift first.",
    };
  }

  // Create linked leave record (“Unavailability”) unless a record already exists for same window.
  const { data: existingTor } = await supabase
    .from("time_off_records")
    .select("id")
    .eq("employee_id", input.employeeId)
    .eq("location_id", input.locationId)
    .eq("time_off_type", "Unavailability")
    .eq("start_at", start.toISOString())
    .eq("end_at", end.toISOString())
    .maybeSingle();

  let timeOffId: string | null = (existingTor as { id?: string } | null)?.id ?? null;
  if (!timeOffId) {
    const { data: tor, error: torErr } = await supabase
      .from("time_off_records")
      .insert({
        employee_id: input.employeeId,
        location_id: input.locationId,
        time_off_type: "Unavailability",
        all_day: false,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        manager_notes: input.reason?.trim() ? input.reason.trim() : "Scheduled as unavailable",
        recorded_by: ctx.employeeId ?? null,
        status: "approved",
        request_source: "manager",
      })
      .select("id")
      .maybeSingle();
    if (torErr) return { ok: false, error: torErr.message };
    timeOffId = (tor as { id?: string } | null)?.id ?? null;
  }

  const { error } = await supabase.from("employee_unavailability").insert({
    employee_id: input.employeeId,
    location_id: input.locationId,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    reason: input.reason?.trim() ? input.reason.trim() : null,
    time_off_record_id: timeOffId,
    created_by_employee_id: ctx.employeeId ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/schedule/board");
  revalidatePath("/time-clock");
  return { ok: true };
}

export async function deleteUnavailability(input: {
  unavailabilityId: string;
}): Promise<UnavailabilityResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);

  const { data: row, error: fetchErr } = await supabase
    .from("employee_unavailability")
    .select("id, location_id, time_off_record_id")
    .eq("id", input.unavailabilityId)
    .maybeSingle();
  if (fetchErr || !row) return { ok: false, error: "Unavailability not found." };

  const locId = (row as { location_id: string }).location_id;
  const denied = await assertCanEditScheduleForLocation(supabase, ctx, locId);
  if (denied) return denied;

  const timeOffId = (row as { time_off_record_id?: string | null }).time_off_record_id ?? null;
  const { error } = await supabase
    .from("employee_unavailability")
    .delete()
    .eq("id", input.unavailabilityId);
  if (error) return { ok: false, error: error.message };

  if (timeOffId) {
    await supabase.from("time_off_records").delete().eq("id", timeOffId);
  }

  revalidatePath("/schedule/board");
  revalidatePath("/time-clock");
  return { ok: true };
}
