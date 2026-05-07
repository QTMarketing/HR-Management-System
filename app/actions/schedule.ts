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

/** True if any of `employeeIds` already has a planned shift overlapping [startIso, endIso) across ANY store. */
async function anyShiftTimeOverlap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: {
    employeeIds: string[];
    startIso: string;
    endIso: string;
    excludeShiftId?: string;
  },
): Promise<boolean> {
  if (input.employeeIds.length === 0) return false;
  try {
    // Two narrow existence checks, each capped at 1 row, run in parallel.
    // (1) Employee is the shift's primary owner.
    let primaryQ = supabase
      .from("shifts")
      .select("id")
      .in("employee_id", input.employeeIds)
      .lt("shift_start", input.endIso)
      .gt("shift_end", input.startIso)
      .limit(1);
    if (input.excludeShiftId) primaryQ = primaryQ.neq("id", input.excludeShiftId);

    // (2) Employee is a multi-assignment row on a shift in the same window.
    // `!inner` makes this a real join so we can filter on the parent shift's time window.
    let assignQ = supabase
      .from("shift_assignments")
      .select("shift_id, shifts!inner(id)")
      .in("employee_id", input.employeeIds)
      .lt("shifts.shift_start", input.endIso)
      .gt("shifts.shift_end", input.startIso)
      .limit(1);
    if (input.excludeShiftId) assignQ = assignQ.neq("shift_id", input.excludeShiftId);

    const [primary, assign] = await Promise.all([primaryQ, assignQ]);
    if (!primary.error && (primary.data ?? []).length > 0) return true;
    if (!assign.error && (assign.data ?? []).length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

/** True if any of `employeeIds` has an approved time-off record overlapping [startIso, endIso). */
async function anyApprovedTimeOffOverlap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: { employeeIds: string[]; startIso: string; endIso: string },
): Promise<boolean> {
  if (input.employeeIds.length === 0) return false;
  try {
    const { data, error } = await supabase
      .from("time_off_records")
      .select("id, employee_id")
      .eq("status", "approved")
      .in("employee_id", input.employeeIds)
      .lt("start_at", input.endIso)
      .gt("end_at", input.startIso)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
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

type ScheduleLocationScope = {
  scopeAll: boolean;
  resolvedLocationId: string;
  allowedLocationIds: Set<string>;
  locations: ReturnType<typeof locationsForSession>;
  /** Avoid re-querying `locations` for manager checks during mutations. */
  managerByLocation: Map<string, string | null>;
};

async function loadScheduleLocationScope(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  cookieStore?: Awaited<ReturnType<typeof cookies>>,
): Promise<ScheduleLocationScope> {
  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name, manager_employee_id")
    .order("sort_order", { ascending: true });

  const managerByLocation = new Map<string, string | null>();
  for (const r of locRows ?? []) {
    const id = r.id as string;
    managerByLocation.set(
      id,
      ((r as { manager_employee_id?: string | null }).manager_employee_id ?? null) as string | null,
    );
  }

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);
  const store = cookieStore ?? (await cookies());
  const resolvedId = resolveSelectedLocationId(
    locations,
    store.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(resolvedId);
  const allowedLocationIds = new Set(locations.map((l) => l.id));
  return { scopeAll, resolvedLocationId: resolvedId, allowedLocationIds, locations, managerByLocation };
}

async function assertCanEditScheduleForLocation(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ctx: Awaited<ReturnType<typeof getRbacContext>>,
  locationId: string,
  /** When set (including `null`), skip the locations round-trip and use this manager id. */
  knownManagerEmployeeId?: string | null,
): Promise<ScheduleMutationResult | null> {
  if (!ctx.enabled) return null;
  if (!hasPermission(ctx, PERMISSIONS.SCHEDULE_EDIT)) {
    return { ok: false, error: "You don’t have permission to edit the schedule." };
  }
  if (ctx.roleKey === "owner") return null;
  if (!ctx.employeeId) {
    return { ok: false, error: "Missing employee profile for permission checks." };
  }
  let managerId: string | null;
  if (knownManagerEmployeeId !== undefined) {
    managerId = knownManagerEmployeeId;
  } else {
    const { data: loc, error } = await supabase
      .from("locations")
      .select("manager_employee_id")
      .eq("id", locationId)
      .maybeSingle();
    if (error || !loc) {
      return { ok: false, error: "Location not found." };
    }
    managerId =
      (loc as { manager_employee_id?: string | null }).manager_employee_id ?? null;
  }
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
  const [{ data: authData }, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const user = authData.user;
  const ctx = await getRbacContext(supabase, user);

  if (!input.jobId?.trim()) {
    return { ok: false, error: "Job is required." };
  }

  const [scope, jobRes] = await Promise.all([
    loadScheduleLocationScope(supabase, cookieStore),
    supabase
      .from("schedule_jobs")
      .select("id, location_id")
      .eq("id", input.jobId.trim())
      .maybeSingle(),
  ]);

  const denied = await assertCanEditScheduleForLocation(
    supabase,
    ctx,
    input.locationId,
    scope.managerByLocation.get(input.locationId),
  );
  if (denied) return denied;

  const { scopeAll, resolvedLocationId, allowedLocationIds } = scope;

  if (!allowedLocationIds.has(input.locationId)) {
    return { ok: false, error: "Invalid location." };
  }
  const { data: job, error: jobErr } = jobRes;
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

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [overlapsUnavailability, overlapsApprovedTimeOff, overlapsShift, empRes] =
    await Promise.all([
      anyUnavailabilityOverlap(supabase, {
        employeeIds: uniqEmployeeIds,
        locationId: input.locationId,
        startIso,
        endIso,
      }),
      anyApprovedTimeOffOverlap(supabase, {
        employeeIds: uniqEmployeeIds,
        startIso,
        endIso,
      }),
      anyShiftTimeOverlap(supabase, {
        employeeIds: uniqEmployeeIds,
        startIso,
        endIso,
      }),
      supabase.from("employees").select("id, location_id, status").in("id", uniqEmployeeIds),
    ]);

  if (overlapsUnavailability) {
    return { ok: false, error: "One or more selected employees are unavailable during this time." };
  }
  if (overlapsApprovedTimeOff) {
    return {
      ok: false,
      error: "Cannot schedule: Employee has approved time off during this period.",
    };
  }
  if (overlapsShift) {
    return {
      ok: false,
      error: "Cannot schedule: Employee is already scheduled for another shift during this period.",
    };
  }

  const { data: emps, error: empErr } = empRes;
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
      job_id: input.jobId.trim(),
      shift_start: startIso,
      shift_end: endIso,
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
  const [{ data: authData }, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const ctx = await getRbacContext(supabase, authData.user);

  const [scope, shiftRes] = await Promise.all([
    loadScheduleLocationScope(supabase, cookieStore),
    supabase.from("shifts").select("id, location_id").eq("id", input.shiftId).maybeSingle(),
  ]);

  const { scopeAll, resolvedLocationId, allowedLocationIds } = scope;

  const { data: shift, error: fetchErr } = shiftRes;
  if (fetchErr || !shift) {
    return { ok: false, error: "Shift not found." };
  }
  const locId = (shift as { location_id: string }).location_id;
  const denied = await assertCanEditScheduleForLocation(
    supabase,
    ctx,
    locId,
    scope.managerByLocation.get(locId),
  );
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
  const [{ data: authData }, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const ctx = await getRbacContext(supabase, authData.user);

  if (!input.jobId?.trim()) {
    return { ok: false, error: "Job is required." };
  }

  const [scope, jobRes, existingRes] = await Promise.all([
    loadScheduleLocationScope(supabase, cookieStore),
    supabase
      .from("schedule_jobs")
      .select("id, location_id")
      .eq("id", input.jobId.trim())
      .maybeSingle(),
    supabase.from("shifts").select("id, location_id").eq("id", input.shiftId).maybeSingle(),
  ]);

  const deniedForTarget = await assertCanEditScheduleForLocation(
    supabase,
    ctx,
    input.locationId,
    scope.managerByLocation.get(input.locationId),
  );
  if (deniedForTarget) return deniedForTarget;

  const { scopeAll, resolvedLocationId, allowedLocationIds } = scope;

  if (!allowedLocationIds.has(input.locationId)) {
    return { ok: false, error: "Invalid location." };
  }
  const { data: job, error: jobErr } = jobRes;
  if (jobErr || !job) return { ok: false, error: "Job not found." };
  if ((job as { location_id: string }).location_id !== input.locationId) {
    return { ok: false, error: "Job does not belong to this store." };
  }
  if (!scopeAll && input.locationId !== resolvedLocationId) {
    return { ok: false, error: "Location does not match your header scope." };
  }

  const { data: existing, error: existingErr } = existingRes;
  if (existingErr || !existing) {
    return { ok: false, error: "Shift not found." };
  }
  const existingLocId = (existing as { location_id: string }).location_id;
  const deniedForExisting = await assertCanEditScheduleForLocation(
    supabase,
    ctx,
    existingLocId,
    scope.managerByLocation.get(existingLocId),
  );
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

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [overlapsUnavailability, overlapsApprovedTimeOff, overlapsShift, empRes] =
    await Promise.all([
      anyUnavailabilityOverlap(supabase, {
        employeeIds: uniqEmployeeIds,
        locationId: input.locationId,
        startIso,
        endIso,
      }),
      anyApprovedTimeOffOverlap(supabase, {
        employeeIds: uniqEmployeeIds,
        startIso,
        endIso,
      }),
      anyShiftTimeOverlap(supabase, {
        employeeIds: uniqEmployeeIds,
        startIso,
        endIso,
        excludeShiftId: input.shiftId,
      }),
      supabase.from("employees").select("id, location_id, status").in("id", uniqEmployeeIds),
    ]);

  if (overlapsUnavailability) {
    return { ok: false, error: "One or more selected employees are unavailable during this time." };
  }
  if (overlapsApprovedTimeOff) {
    return {
      ok: false,
      error: "Cannot schedule: Employee has approved time off during this period.",
    };
  }
  if (overlapsShift) {
    return {
      ok: false,
      error: "Cannot schedule: Employee is already scheduled for another shift during this period.",
    };
  }

  const { data: emps, error: empErr } = empRes;
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
      job_id: input.jobId.trim(),
      shift_start: startIso,
      shift_end: endIso,
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

/** Format the Monday of a week as e.g. "May 4th" — used in publish notifications. */
function formatWeekOfLabel(monday: Date): string {
  const day = monday.getDate();
  const ordinal =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  const month = monday.toLocaleString("en-US", { month: "long" });
  return `${month} ${day}${ordinal}`;
}

/** Set `is_published = true` for draft shifts in the visible week and location scope. */
export async function publishDraftShiftsForWeek(
  weekParam: string | undefined,
): Promise<PublishScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const [{ data: authData }, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const ctx = await getRbacContext(supabase, authData.user);
  if (ctx.enabled && !hasPermission(ctx, PERMISSIONS.SCHEDULE_EDIT)) {
    return { ok: false, error: "You don’t have permission to publish the schedule." };
  }

  // Resolve scope from cookie (avoid the extra locations round-trip used previously
  // — `loadScheduleLocationScope` already handles demo fallback + cookie parsing).
  const { scopeAll, resolvedLocationId: locationId } = await loadScheduleLocationScope(
    supabase,
    cookieStore,
  );

  const weekMonday = parseWeekMondayParam(weekParam);
  const weekEnd = addDays(weekMonday, 7);

  // Push the update down to Postgres and ask for the affected rows back so we
  // can fan-out notifications without a second SELECT round trip.
  let q = supabase
    .from("shifts")
    .update({ is_published: true })
    .eq("is_published", false)
    .gte("shift_start", weekMonday.toISOString())
    .lt("shift_start", weekEnd.toISOString());
  if (!scopeAll) q = q.eq("location_id", locationId);

  const { data: publishedRows, error } = await q.select("id, employee_id");
  if (error) {
    return { ok: false, error: error.message };
  }

  const published = (publishedRows ?? []) as { id: string; employee_id: string | null }[];

  if (published.length > 0) {
    // Pull multi-employee assignments + primary employee in parallel; both feed
    // the same `Set<employeeId>` we hand to the notifications insert.
    const shiftIds = published.map((s) => s.id);
    const { data: assignmentRows } = await supabase
      .from("shift_assignments")
      .select("employee_id")
      .in("shift_id", shiftIds);

    const employeeIds = new Set<string>();
    for (const s of published) {
      if (s.employee_id) employeeIds.add(s.employee_id);
    }
    for (const a of (assignmentRows ?? []) as { employee_id: string }[]) {
      if (a.employee_id) employeeIds.add(a.employee_id);
    }

    if (employeeIds.size > 0) {
      const weekLabel = formatWeekOfLabel(weekMonday);
      const link = weekParam ? `/schedule/board?week=${encodeURIComponent(weekParam)}` : "/schedule/board";
      const rows = [...employeeIds].map((employee_id) => ({
        employee_id,
        title: "New Schedule Published",
        message: `Your shifts for the week of ${weekLabel} are now available.`,
        link,
      }));
      // Best-effort: a notifications failure must not roll back the publish.
      // If the migration hasn't run yet we still want the schedule to ship.
      const { error: notifyErr } = await supabase.from("notifications").insert(rows);
      if (notifyErr) {
        console.error("[schedule.publish] failed to insert notifications", notifyErr.message);
      }
    }
  }

  revalidatePath("/schedule/board");
  revalidatePath("/schedule");
  return { ok: true };
}

export type CopyPreviousWeekResult =
  | { ok: true; copied: number }
  | { ok: false; error: string };

/** Shift start/end forward by 7 calendar days (same pattern as the board week step). */
function shiftTimesOneWeekForward(isoStart: string, isoEnd: string): {
  shift_start: string;
  shift_end: string;
} {
  const a = new Date(isoStart);
  const b = new Date(isoEnd);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return { shift_start: isoStart, shift_end: isoEnd };
  }
  return {
    shift_start: addDays(a, 7).toISOString(),
    shift_end: addDays(b, 7).toISOString(),
  };
}

/**
 * Duplicate last week’s shifts into the current week as drafts (not published).
 * Assignments are copied; times move forward exactly one week.
 */
export async function copyPreviousWeekShifts(
  locationId: string,
  currentWeekMondayIso: string,
): Promise<CopyPreviousWeekResult> {
  const supabase = await createSupabaseServerClient();
  const [{ data: authData }, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const ctx = await getRbacContext(supabase, authData.user);

  const scope = await loadScheduleLocationScope(supabase, cookieStore);
  const { scopeAll, resolvedLocationId, allowedLocationIds, managerByLocation } = scope;

  if (!locationId?.trim()) {
    return { ok: false, error: "Store is required." };
  }
  if (!allowedLocationIds.has(locationId)) {
    return { ok: false, error: "Invalid store." };
  }
  if (!scopeAll && locationId !== resolvedLocationId) {
    return { ok: false, error: "Store does not match your current scope." };
  }

  const denied = await assertCanEditScheduleForLocation(
    supabase,
    ctx,
    locationId,
    managerByLocation.get(locationId),
  );
  if (denied?.ok === false) return denied;

  const currentMonday = parseWeekMondayParam(currentWeekMondayIso);
  const prevMonday = addDays(currentMonday, -7);
  const prevWeekEnd = addDays(prevMonday, 7);

  const { data: sourceRows, error: fetchErr } = await supabase
    .from("shifts")
    .select(
      "id, employee_id, location_id, job_id, shift_group_id, shift_start, shift_end, notes, slots_total, notify_badge_count",
    )
    .eq("location_id", locationId)
    .gte("shift_start", prevMonday.toISOString())
    .lt("shift_start", prevWeekEnd.toISOString())
    .order("shift_start", { ascending: true });

  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }

  const rows = (sourceRows ?? []) as {
    id: string;
    employee_id: string;
    location_id: string;
    job_id: string | null;
    shift_group_id: string | null;
    shift_start: string;
    shift_end: string;
    notes: string | null;
    slots_total: number | null;
    notify_badge_count: number | null;
  }[];

  if (rows.length === 0) {
    return { ok: true, copied: 0 };
  }

  const shiftIds = rows.map((r) => r.id);
  const { data: assignRows, error: assignFetchErr } = await supabase
    .from("shift_assignments")
    .select("shift_id, employee_id")
    .in("shift_id", shiftIds);

  if (assignFetchErr) {
    return { ok: false, error: assignFetchErr.message };
  }

  const byShift = new Map<string, string[]>();
  for (const a of assignRows ?? []) {
    const sid = (a as { shift_id: string }).shift_id;
    const eid = (a as { employee_id: string }).employee_id;
    if (!byShift.has(sid)) byShift.set(sid, []);
    byShift.get(sid)!.push(eid);
  }

  function employeeIdsForShift(row: (typeof rows)[0]): string[] {
    const fromA = byShift.get(row.id);
    const raw =
      fromA && fromA.length > 0 ? fromA : [row.employee_id];
    return [...new Set(raw)];
  }

  const inserts = rows.map((r) => {
    const empIds = employeeIdsForShift(r);
    const { shift_start, shift_end } = shiftTimesOneWeekForward(r.shift_start, r.shift_end);
    return {
      employee_id: empIds[0] ?? r.employee_id,
      location_id: r.location_id,
      job_id: r.job_id,
      shift_group_id: r.shift_group_id,
      shift_start,
      shift_end,
      notes: r.notes,
      slots_total: r.slots_total ?? 2,
      notify_badge_count: r.notify_badge_count ?? 1,
      is_published: false as const,
    };
  });

  const { data: inserted, error: insErr } = await supabase
    .from("shifts")
    .insert(inserts)
    .select("id");

  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  const newIds = (inserted ?? []) as { id: string }[];
  if (newIds.length !== rows.length) {
    return { ok: false, error: "Could not copy all shifts (insert mismatch)." };
  }

  const assignmentInserts: { shift_id: string; employee_id: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const oldRow = rows[i]!;
    const newId = newIds[i]!.id;
    for (const employeeId of employeeIdsForShift(oldRow)) {
      assignmentInserts.push({ shift_id: newId, employee_id: employeeId });
    }
  }

  if (assignmentInserts.length > 0) {
    const { error: aErr } = await supabase.from("shift_assignments").insert(assignmentInserts);
    if (aErr) {
      return { ok: false, error: aErr.message };
    }
  }

  revalidatePath("/schedule/board");
  revalidatePath("/schedule");
  return { ok: true, copied: rows.length };
}

export type AutoAssignJobsResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

/** Backfill missing `job_id` for shifts in the visible week/scope (mock/demo helper). */
export async function autoAssignJobsForWeek(
  weekParam: string | undefined,
): Promise<AutoAssignJobsResult> {
  const supabase = await createSupabaseServerClient();
  const [{ data: authData }, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const ctx = await getRbacContext(supabase, authData.user);

  const scope = await loadScheduleLocationScope(supabase, cookieStore);
  const { scopeAll, resolvedLocationId: locationId } = scope;

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
    const denied = await assertCanEditScheduleForLocation(
      supabase,
      ctx,
      locationId,
      scope.managerByLocation.get(locationId),
    );
    if (denied?.ok === false) return denied;
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

/** Create sample shifts for the visible week/scope (preview helper). */
export async function seedDemoShiftsForWeek(
  weekParam: string | undefined,
): Promise<SeedDemoWeekResult> {
  const supabase = await createSupabaseServerClient();
  const [{ data: authData }, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const ctx = await getRbacContext(supabase, authData.user);

  const scope = await loadScheduleLocationScope(supabase, cookieStore);
  const { scopeAll, resolvedLocationId: locationId } = scope;

  // For safety: only owners can generate across all locations.
  if (scopeAll) {
    if (ctx.enabled && ctx.roleKey !== "owner") {
      return { ok: false, error: "Switch to a specific store to generate sample shifts." };
    }
  } else {
    const denied = await assertCanEditScheduleForLocation(
      supabase,
      ctx,
      locationId,
      scope.managerByLocation.get(locationId),
    );
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
  const [{ data: authData }, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const ctx = await getRbacContext(supabase, authData.user);

  const [scope, empRes] = await Promise.all([
    loadScheduleLocationScope(supabase, cookieStore),
    supabase
      .from("employees")
      .select("id, location_id, status")
      .eq("id", input.employeeId)
      .maybeSingle(),
  ]);

  const denied = await assertCanEditScheduleForLocation(
    supabase,
    ctx,
    input.locationId,
    scope.managerByLocation.get(input.locationId),
  );
  if (denied) return denied;

  const start = new Date(input.startAtIso);
  const end = new Date(input.endAtIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "Invalid unavailability times." };
  }

  const { data: emp, error: empErr } = empRes;
  if (empErr || !emp) return { ok: false, error: "Employee not found." };
  const e = emp as { location_id: string; status?: string };
  if (e.status && e.status !== "active") return { ok: false, error: "Employee is not active." };
  if (e.location_id !== input.locationId) return { ok: false, error: "Employee does not belong to this store." };

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [overlapsExistingUnavail, overlapsShift] = await Promise.all([
    anyUnavailabilityBlockOverlap(supabase, {
      employeeId: input.employeeId,
      locationId: input.locationId,
      startIso,
      endIso,
    }),
    anyShiftTimeOverlap(supabase, {
      employeeIds: [input.employeeId],
      startIso,
      endIso,
    }),
  ]);
  if (overlapsExistingUnavail) {
    return {
      ok: false,
      error: "An unavailability block already exists that overlaps this time.",
    };
  }

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
    .eq("start_at", startIso)
    .eq("end_at", endIso)
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
  const [{ data: authData }, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const ctx = await getRbacContext(supabase, authData.user);

  const [scope, rowRes] = await Promise.all([
    loadScheduleLocationScope(supabase, cookieStore),
    supabase
      .from("employee_unavailability")
      .select("id, location_id, time_off_record_id")
      .eq("id", input.unavailabilityId)
      .maybeSingle(),
  ]);

  const { data: row, error: fetchErr } = rowRes;
  if (fetchErr || !row) return { ok: false, error: "Unavailability not found." };

  const locId = (row as { location_id: string }).location_id;
  const denied = await assertCanEditScheduleForLocation(
    supabase,
    ctx,
    locId,
    scope.managerByLocation.get(locId),
  );
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
