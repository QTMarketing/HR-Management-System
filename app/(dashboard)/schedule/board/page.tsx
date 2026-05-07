import { cookies } from "next/headers";
import { ScheduleWeekBoard } from "@/components/schedule/schedule-week-board";
import { draftPublishCount, type ShiftForBoard } from "@/lib/schedule/board-model";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import {
  addDays,
  formatWeekQueryParam,
  mondayOfWeekContaining,
  parseWeekMondayParam,
} from "@/lib/schedule/week";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ week?: string; add?: string; view?: string; date?: string }>;
};

function parseYmd(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pickEmployee(raw: unknown): { full_name: string; role: string } {
  if (raw == null) return { full_name: "—", role: "—" };
  const emp = Array.isArray(raw) ? raw[0] : raw;
  if (!emp || typeof emp !== "object") return { full_name: "—", role: "—" };
  const e = emp as { full_name?: string; role?: string };
  return { full_name: e.full_name ?? "—", role: e.role ?? "—" };
}

function pickJob(raw: unknown): { name: string; color_hex: string; sort_order: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { name?: string; color_hex?: string; sort_order?: number };
  if (typeof o.name !== "string") return null;
  return {
    name: o.name,
    color_hex: typeof o.color_hex === "string" ? o.color_hex : "#64748b",
    sort_order: Number(o.sort_order) || 0,
  };
}

type ShiftRow = {
  id: string;
  employee_id: string;
  location_id: string;
  shift_start: string;
  shift_end: string;
  notes: string | null;
  is_published: boolean | null;
  slots_total: number | null;
  notify_badge_count: number | null;
  shift_group_id: string | null;
  job_id: string | null;
  schedule_jobs: unknown;
  employees: unknown;
};

type AssignmentRow = {
  shift_id: string;
  employee_id: string;
  employees: unknown;
};

type JobOptionRow = { id: string; location_id: string; name: string; sort_order: number | null };

type UnavailabilityRow = {
  id: string;
  employee_id: string;
  location_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
};

function pickEmployeeNameOnly(raw: unknown): string | null {
  if (raw == null) return null;
  const emp = Array.isArray(raw) ? raw[0] : raw;
  if (!emp || typeof emp !== "object") return null;
  const e = emp as { full_name?: string };
  return typeof e.full_name === "string" ? e.full_name : null;
}

export default async function ScheduleBoardPage({ searchParams }: PageProps) {
  await requirePermission(PERMISSIONS.SCHEDULE_VIEW);

  const sp = await searchParams;
  const view = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const selectedDate = parseYmd(sp.date) ?? new Date();
  const weekMonday =
    view === "week" ? parseWeekMondayParam(sp.week) : mondayOfWeekContaining(selectedDate);
  const weekEnd = addDays(weekMonday, 7);
  const monthStart = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    1,
    12,
    0,
    0,
    0,
  );
  const monthEnd = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth() + 1,
    1,
    12,
    0,
    0,
    0,
  );
  const rangeStart =
    view === "month" ? monthStart : view === "day" ? new Date(selectedDate) : weekMonday;
  const rangeEnd =
    view === "month" ? monthEnd : view === "day" ? addDays(new Date(selectedDate), 1) : weekEnd;

  const supabase = await createSupabaseServerClient();

  // Auth + cookie are independent — fetch in parallel.
  const [authResult, cookieStore] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
  ]);
  const user = authResult.data.user;

  // Locations + RBAC context have no dependency on each other; fan them out together.
  // We widen the locations select to include `manager_employee_id` so the per-store
  // edit check below can be answered from cache instead of an extra round-trip.
  type LocationFullRow = { id: string; name: string; manager_employee_id: string | null };
  const [locResult, ctx] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, manager_employee_id")
      .order("sort_order", { ascending: true }),
    getRbacContext(supabase, user),
  ]);
  const locRows = (locResult.data ?? []) as LocationFullRow[];
  const canEditByPermission = !ctx.enabled || hasPermission(ctx, PERMISSIONS.SCHEDULE_EDIT);

  let rawLocations: LocationRow[] = locRows.map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);
  /** Names for every session location (demo fallback included); avoid empty map when `locRows` is empty but `rawLocations` is demo-filled. */
  const locNameById = new Map(rawLocations.map((l) => [l.id, l.name] as const));
  const managerByLocation = new Map(
    locRows.map((r) => [r.id, r.manager_employee_id ?? null] as const),
  );

  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);
  const locationLabel =
    locations.find((l) => l.id === locationId)?.name ?? "Location";

  // Per-store edit rule: owners can edit any store; otherwise only the store’s manager can edit.
  // Resolved from the cached `manager_employee_id` we just selected — no extra fetch.
  let canEditSchedule = false;
  if (!ctx.enabled) {
    canEditSchedule = true;
  } else if (canEditByPermission && ctx.roleKey === "owner") {
    canEditSchedule = true;
  } else if (canEditByPermission && !scopeAll && ctx.employeeId) {
    const managerId = managerByLocation.get(locationId) ?? null;
    canEditSchedule = managerId != null && managerId === ctx.employeeId;
  }

  const locationsForPicker = rawLocations.map((l) => ({ id: l.id, name: l.name }));

  // Build the four heavy reads. None depend on each other — fan them out together.
  let shiftQ = supabase
    .from("shifts")
    .select(
      `id, employee_id, location_id, shift_start, shift_end, notes,
       is_published, slots_total, notify_badge_count, shift_group_id, job_id,
       schedule_jobs ( name, color_hex, sort_order ),
       employees!shifts_employee_id_fkey ( full_name, role )`,
    )
    .gte("shift_start", rangeStart.toISOString())
    .lt("shift_start", rangeEnd.toISOString())
    .order("shift_start", { ascending: true });
  if (!scopeAll) shiftQ = shiftQ.eq("location_id", locationId);

  let unavailQ = supabase
    .from("employee_unavailability")
    .select("id, employee_id, location_id, start_at, end_at, reason")
    .gte("start_at", rangeStart.toISOString())
    .lt("start_at", rangeEnd.toISOString())
    .order("start_at", { ascending: true });
  if (!scopeAll) unavailQ = unavailQ.eq("location_id", locationId);

  const empQ = supabase
    .from("employees")
    .select("id, full_name, location_id")
    .eq("status", "active")
    .order("full_name");

  const jobQ = supabase
    .from("schedule_jobs")
    .select("id, location_id, name, sort_order")
    .order("sort_order", { ascending: true });

  const [empRes, jobRes, shiftRes, unavailRes] = await Promise.all([
    empQ,
    jobQ,
    shiftQ,
    unavailQ,
  ]);

  let employeesForPicker = (empRes.data ?? []).map((r) => ({
    id: r.id,
    full_name: (r.full_name as string) ?? "—",
    location_id: r.location_id as string,
  }));
  if (!scopeAll) {
    employeesForPicker = employeesForPicker.filter((e) => e.location_id === locationId);
  }

  let jobsForPicker = (jobRes.data ?? []).map((r) => ({
    id: (r as JobOptionRow).id,
    location_id: (r as JobOptionRow).location_id,
    name: (r as JobOptionRow).name,
  }));
  if (!scopeAll) {
    jobsForPicker = jobsForPicker.filter((j) => j.location_id === locationId);
  }

  let shifts: ShiftForBoard[] = [];
  let errorMessage: string | null = null;
  let missingJobCount = 0;

  if (shiftRes.error) {
    errorMessage = shiftRes.error.message;
  } else if (shiftRes.data) {
    const rows = shiftRes.data as ShiftRow[];
    missingJobCount = rows.filter((r) => r.job_id == null).length;
    const ids = rows.map((r) => r.id);
    const assignMap = new Map<string, number>();
    const assignNames = new Map<string, string[]>();
    const assignIds = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: assignRows } = await supabase
        .from("shift_assignments")
        .select("shift_id, employee_id, employees!shift_assignments_employee_id_fkey ( full_name )")
        .in("shift_id", ids);
      for (const a of (assignRows ?? []) as AssignmentRow[]) {
        const sid = a.shift_id;
        assignMap.set(sid, (assignMap.get(sid) ?? 0) + 1);
        const nm = pickEmployeeNameOnly(a.employees);
        if (nm) assignNames.set(sid, [...(assignNames.get(sid) ?? []), nm]);
        assignIds.set(sid, [...(assignIds.get(sid) ?? []), a.employee_id]);
      }
    }

    shifts = rows.map((row) => {
      const emp = pickEmployee(row.employees);
      const job = pickJob(row.schedule_jobs);
      const assignedEmployeeIds = assignIds.get(row.id) ?? (row.employee_id ? [row.employee_id] : []);
      const assignedEmployeeNames = assignNames.get(row.id) ?? (emp.full_name ? [emp.full_name] : []);
      const assignCount = assignedEmployeeIds.length || assignMap.get(row.id) || 0;
      const assignedLabel =
        assignCount <= 0
          ? "0 users"
          : assignCount === 1
            ? (assignedEmployeeNames[0] ?? emp.full_name)
            : `${assignCount} users`;
      const hasJob = row.job_id != null && job != null;
      // Simplified scheduling: no Morning/Evening sections — treat all shifts as one all-day board.
      return {
        id: row.id,
        employee_id: row.employee_id,
        assignedEmployeeIds,
        assignedEmployeeNames,
        location_id: row.location_id,
        shift_start: row.shift_start,
        shift_end: row.shift_end,
        notes: row.notes,
        assignedLabel,
        groupName: "All day",
        groupSort: 0,
        boardSectionLayerName: null,
        extraLayerLabels: [],
        jobName: hasJob ? job.name : null,
        jobSort: hasJob ? job.sort_order : -1,
        jobColorHex: hasJob ? job.color_hex : "#94a3b8",
        isPublished: row.is_published !== false,
        slotsTotal: row.slots_total ?? 2,
        assignCount,
        notifyBadgeCount: row.notify_badge_count ?? 0,
      };
    });
  }

  // If migration 034 isn't applied yet, the unavailability table won't exist — degrade gracefully.
  const unavailability: UnavailabilityRow[] = unavailRes.error
    ? []
    : ((unavailRes.data ?? []) as UnavailabilityRow[]);

  const publishDraftCount = draftPublishCount(shifts);

  const today = new Date();
  const prev =
    view === "month"
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1, 12, 0, 0, 0)
      : view === "day"
        ? addDays(selectedDate, -1)
        : addDays(weekMonday, -7);
  const next =
    view === "month"
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1, 12, 0, 0, 0)
      : view === "day"
        ? addDays(selectedDate, 1)
        : addDays(weekMonday, 7);
  const todayRef =
    view === "month"
      ? new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0)
      : view === "day"
        ? today
        : mondayOfWeekContaining(today);

  const qs = (d: Date) => {
    const p = new URLSearchParams();
    p.set("view", view);
    if (view === "week") p.set("week", formatWeekQueryParam(mondayOfWeekContaining(d)));
    else p.set("date", formatYmd(d));
    return `?${p.toString()}`;
  };

  const rangeLabel =
    view === "day"
      ? selectedDate.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : view === "month"
        ? selectedDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
        : `${weekMonday.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(
            weekMonday,
            6,
          ).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {errorMessage}
        </p>
      ) : null}

      <ScheduleWeekBoard
        weekMonday={weekMonday}
        weekParam={formatWeekQueryParam(weekMonday)}
        rangeLabel={rangeLabel}
        prevWeekHref={`/schedule/board${qs(prev)}`}
        nextWeekHref={`/schedule/board${qs(next)}`}
        todayWeekHref={`/schedule/board${qs(todayRef)}`}
        locationLabel={locationLabel}
        scopeAll={scopeAll}
        locationNamesById={locNameById}
        shifts={shifts}
        publishDraftCount={publishDraftCount}
        canEditSchedule={canEditSchedule}
        employeesForPicker={employeesForPicker}
        locationsForPicker={locationsForPicker}
        defaultLocationId={scopeAll ? null : locationId}
        initialAddOpen={sp.add === "1"}
        missingJobCount={missingJobCount}
        jobsForPicker={jobsForPicker}
        viewRange={view}
        selectedDate={selectedDate}
        unavailability={unavailability}
      />
    </div>
  );
}
