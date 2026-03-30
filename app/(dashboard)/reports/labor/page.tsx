import Link from "next/link";
import { cookies } from "next/headers";
import { formatHoursClock } from "@/lib/schedule/board-model";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addDays,
  formatWeekQueryParam,
  hoursBetween,
  hoursInWindow,
  mondayOfWeekContaining,
} from "@/lib/schedule/week";
import { ArrowLeft, CalendarRange, Clock } from "lucide-react";

type ShiftRow = { shift_start: string; shift_end: string; location_id: string };
type EntryRow = {
  clock_in_at: string;
  clock_out_at: string | null;
  location_id: string;
};

export default async function WeeklyLaborReportPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

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

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);
  const locationLabel =
    locations.find((l) => l.id === locationId)?.name ?? "Location";

  const weekMonday = mondayOfWeekContaining(new Date());
  const weekEnd = addDays(weekMonday, 7);
  const weekParam = formatWeekQueryParam(weekMonday);

  const rangeLabel = `${weekMonday.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${addDays(weekMonday, 6).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  let scheduledHours = 0;
  let workedHours = 0;
  let shiftCount = 0;
  let errorMessage: string | null = null;

  try {
    let shiftQ = supabase
      .from("shifts")
      .select("shift_start, shift_end, location_id")
      .gte("shift_start", weekMonday.toISOString())
      .lt("shift_start", weekEnd.toISOString());
    if (!scopeAll) {
      shiftQ = shiftQ.eq("location_id", locationId);
    }
    const { data: shifts, error: shiftErr } = await shiftQ;
    if (shiftErr) {
      errorMessage = shiftErr.message;
    } else {
      const rows = (shifts ?? []) as ShiftRow[];
      shiftCount = rows.length;
      for (const s of rows) {
        scheduledHours += hoursBetween(s.shift_start, s.shift_end);
      }
    }

    /** Punches that can overlap the week (avoid loading full history). */
    const entriesFetchStart = addDays(weekMonday, -2);
    let entryQ = supabase
      .from("time_entries")
      .select("clock_in_at, clock_out_at, location_id")
      .gte("clock_in_at", entriesFetchStart.toISOString())
      .lt("clock_in_at", weekEnd.toISOString());
    if (!scopeAll) {
      entryQ = entryQ.eq("location_id", locationId);
    }
    const { data: entries, error: entryErr } = await entryQ;
    if (entryErr) {
      errorMessage = errorMessage ?? entryErr.message;
    } else {
      const now = new Date();
      for (const e of (entries ?? []) as EntryRow[]) {
        const start = new Date(e.clock_in_at);
        const end = e.clock_out_at ? new Date(e.clock_out_at) : now;
        workedHours += hoursInWindow(start, end, weekMonday, weekEnd);
      }
    }

    scheduledHours = Math.round(scheduledHours * 100) / 100;
    workedHours = Math.round(workedHours * 100) / 100;
  } catch (e) {
    errorMessage =
      e instanceof Error ? e.message : "Could not load labor data (check migrations / RLS).";
  }

  const coveragePct =
    scheduledHours > 0 ? Math.min(100, Math.round((workedHours / scheduledHours) * 1000) / 10) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Weekly labor summary
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {rangeLabel}
            <span className="text-slate-400"> · </span>
            <span className="font-medium text-slate-700">
              {scopeAll ? "All locations" : locationLabel}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/schedule/board?week=${encodeURIComponent(weekParam)}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <CalendarRange className="h-4 w-4 text-slate-600" />
            Open schedule
          </Link>
          <Link
            href="/time-clock"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <Clock className="h-4 w-4 text-slate-600" />
            Time clock
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Scheduled hours
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {formatHoursClock(scheduledHours)}
          </p>
          <p className="mt-1 text-xs text-slate-500">From shifts starting this week</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Worked hours
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {formatHoursClock(workedHours)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Time punches overlapping this week (open punches count to now)
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Shifts planned
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{shiftCount}</p>
          <p className="mt-1 text-xs text-slate-500">
            {coveragePct != null ? (
              <>
                Coverage vs scheduled:{" "}
                <span className="font-semibold text-slate-700">{coveragePct}%</span>
              </>
            ) : (
              "No scheduled hours this week — coverage N/A"
            )}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Demo report: totals follow the header location scope. &quot;Coverage&quot; is worked ÷
        scheduled hours for the week (not headcount).
      </p>
    </div>
  );
}
