import { cookies } from "next/headers";
import { ScheduleWeekBoard } from "@/components/schedule/schedule-week-board";
import type { ShiftForBoard } from "@/lib/schedule/board-model";
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
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ week?: string }>;
};

function pickEmployee(
  raw: unknown,
): { full_name: string; role: string } {
  if (raw == null) return { full_name: "—", role: "—" };
  const emp = Array.isArray(raw) ? raw[0] : raw;
  if (!emp || typeof emp !== "object") return { full_name: "—", role: "—" };
  const e = emp as { full_name?: string; role?: string };
  return { full_name: e.full_name ?? "—", role: e.role ?? "—" };
}

export default async function ScheduleBoardPage({ searchParams }: PageProps) {
  await requirePermission(PERMISSIONS.SCHEDULE_VIEW);

  const sp = await searchParams;
  const weekMonday = parseWeekMondayParam(sp.week);
  const weekEnd = addDays(weekMonday, 7);

  const supabase = await createSupabaseServerClient();

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);
  const locNameById = new Map((locRows ?? []).map((l) => [l.id, l.name] as const));

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);
  const locationLabel =
    locations.find((l) => l.id === locationId)?.name ?? "Location";

  let shifts: ShiftForBoard[] = [];
  let errorMessage: string | null = null;

  try {
    let q = supabase
      .from("shifts")
      .select("id, employee_id, location_id, shift_start, shift_end, notes, employees(full_name, role)")
      .gte("shift_start", weekMonday.toISOString())
      .lt("shift_start", weekEnd.toISOString())
      .order("shift_start", { ascending: true });

    if (!scopeAll) {
      q = q.eq("location_id", locationId);
    }

    const { data, error } = await q;

    if (error) {
      errorMessage = error.message;
    } else if (data) {
      shifts = data.map((row) => {
        const emp = pickEmployee(row.employees);
        return {
          id: row.id,
          employee_id: row.employee_id,
          location_id: row.location_id,
          shift_start: row.shift_start,
          shift_end: row.shift_end,
          notes: row.notes,
          employeeName: emp.full_name,
          employeeRole: emp.role,
        };
      });
    }
  } catch (e) {
    errorMessage =
      e instanceof Error ? e.message : "Could not load shifts (run migration 006).";
  }

  const prevMonday = addDays(weekMonday, -7);
  const nextMonday = addDays(weekMonday, 7);
  const todayMonday = mondayOfWeekContaining(new Date());

  const qs = (d: Date) => {
    const w = formatWeekQueryParam(d);
    return `?week=${encodeURIComponent(w)}`;
  };

  const sunday = addDays(weekMonday, 6);
  const rangeLabel = `${weekMonday.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${sunday.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {errorMessage}
        </p>
      ) : null}

      <ScheduleWeekBoard
        weekMonday={weekMonday}
        rangeLabel={rangeLabel}
        prevWeekHref={`/schedule/board${qs(prevMonday)}`}
        nextWeekHref={`/schedule/board${qs(nextMonday)}`}
        todayWeekHref={`/schedule/board${qs(todayMonday)}`}
        locationLabel={locationLabel}
        scopeAll={scopeAll}
        locationNamesById={locNameById}
        shifts={shifts}
      />
    </div>
  );
}
