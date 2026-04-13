import Link from "next/link";
import { cookies } from "next/headers";
import { LaborReportCsvButton } from "@/components/reports/labor-report-csv-button";
import { formatHoursClock } from "@/lib/schedule/board-model";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import type { LaborWeekCsvMeta, LaborWeekCsvRow } from "@/lib/reports/labor-week-csv";
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

type ShiftRow = {
  shift_start: string;
  shift_end: string;
  location_id: string;
  employee_id: string;
};
type EntryRow = {
  clock_in_at: string;
  clock_out_at: string | null;
  location_id: string;
  employee_id: string;
};

type EmployeeLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  role: string | null;
};

function employeeDisplayName(e: EmployeeLite): string {
  const fn = e.first_name?.trim() ?? "";
  const ln = e.last_name?.trim() ?? "";
  const combined = [fn, ln].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return e.full_name?.trim() || "Employee";
}

function pctCoverage(worked: number, scheduled: number): number | null {
  if (scheduled <= 0) return null;
  return Math.min(100, Math.round((worked / scheduled) * 1000) / 10);
}

export default async function WeeklyLaborReportPage() {
  await requirePermission(PERMISSIONS.LABOR_REPORT_VIEW);

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

  type Agg = { scheduled: number; worked: number; shifts: number };
  const byEmployee = new Map<string, Agg>();

  function bump(
    employeeId: string,
    patch: Partial<{ scheduled: number; worked: number; shifts: number }>,
  ) {
    let a = byEmployee.get(employeeId);
    if (!a) {
      a = { scheduled: 0, worked: 0, shifts: 0 };
      byEmployee.set(employeeId, a);
    }
    if (patch.scheduled != null) a.scheduled += patch.scheduled;
    if (patch.worked != null) a.worked += patch.worked;
    if (patch.shifts != null) a.shifts += patch.shifts;
  }

  try {
    let shiftQ = supabase
      .from("shifts")
      .select("shift_start, shift_end, location_id, employee_id")
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
        const h = hoursBetween(s.shift_start, s.shift_end);
        scheduledHours += h;
        bump(s.employee_id, { scheduled: h, shifts: 1 });
      }
    }

    const entriesFetchStart = addDays(weekMonday, -2);
    let entryQ = supabase
      .from("time_entries")
      .select("clock_in_at, clock_out_at, location_id, employee_id")
      .is("archived_at", null)
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
        const w = hoursInWindow(start, end, weekMonday, weekEnd);
        workedHours += w;
        bump(e.employee_id, { worked: w });
      }
    }

    scheduledHours = Math.round(scheduledHours * 100) / 100;
    workedHours = Math.round(workedHours * 100) / 100;
  } catch (e) {
    errorMessage =
      e instanceof Error ? e.message : "Could not load labor data (check migrations / RLS).";
  }

  const coveragePct = pctCoverage(workedHours, scheduledHours);

  const employeeIds = [...byEmployee.keys()];
  let employeesById = new Map<string, EmployeeLite>();
  if (employeeIds.length > 0 && !errorMessage) {
    const { data: emps, error: empErr } = await supabase
      .from("employees")
      .select("id, first_name, last_name, full_name, role")
      .in("id", employeeIds);
    if (empErr) {
      errorMessage = errorMessage ?? empErr.message;
    } else {
      employeesById = new Map(
        ((emps ?? []) as EmployeeLite[]).map((e) => [e.id, e]),
      );
    }
  }

  const csvRows: LaborWeekCsvRow[] = [...byEmployee.entries()].map(([id, a]) => {
    const emp = employeesById.get(id);
    const name = emp ? employeeDisplayName(emp) : "Unknown employee";
    const role = emp?.role?.trim() || "—";
    const cov = pctCoverage(a.worked, a.scheduled);
    return {
      employeeId: id,
      employeeName: name,
      role,
      scheduledHours: Math.round(a.scheduled * 100) / 100,
      workedHours: Math.round(a.worked * 100) / 100,
      shiftCount: a.shifts,
      coveragePct: cov,
    };
  });

  const csvMeta: LaborWeekCsvMeta = {
    periodRangeLabel: rangeLabel,
    scopeLabel: scopeAll ? "All locations" : locationLabel,
    totals: {
      scheduledHours,
      workedHours,
      shiftCount,
      coveragePct,
    },
  };

  const tableRows = [...csvRows].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" }),
  );

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
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
            Compare scheduled shifts with actual hours worked this week. For a detailed view of all clock-ins
            and clock-outs, visit the{" "}
            <Link href="/time-clock" className="font-medium text-orange-600 hover:text-orange-800">
              Time Clock
            </Link>{" "}
            or export a timesheet report.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/schedule/board?week=${encodeURIComponent(weekParam)}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <CalendarRange className="h-4 w-4 text-slate-600" />
            View Schedule
          </Link>
          <Link
            href="/time-clock"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <Clock className="h-4 w-4 text-slate-600" />
            Time Clock
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
          <p className="mt-1 text-xs text-slate-500">Total time planned for this week</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Worked hours
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {formatHoursClock(workedHours)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Total time logged this week (including active shifts)
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
                Compared to scheduled time:{" "}
                <span className="font-semibold text-slate-700">{coveragePct}%</span>
              </>
            ) : (
              "No shifts scheduled for this week"
            )}
          </p>
        </div>
      </div>

      {!errorMessage ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Team Breakdown</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Shows all team members with scheduled or logged hours this week.
              </p>
            </div>
            <LaborReportCsvButton weekMonday={weekMonday} meta={csvMeta} rows={csvRows} />
          </div>
          {tableRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No data available yet. Schedule shifts or have your team track time to see their hours here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-right tabular-nums">Scheduled</th>
                    <th className="px-4 py-3 text-right tabular-nums">Worked</th>
                    <th className="px-4 py-3 text-right tabular-nums">Shifts</th>
                    <th className="px-4 py-3 text-right tabular-nums">vs. scheduled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableRows.map((r) => (
                    <tr key={r.employeeId} className="text-slate-800">
                      <td className="px-4 py-3 font-medium">{r.employeeName}</td>
                      <td className="px-4 py-3 text-slate-600">{r.role}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatHoursClock(r.scheduledHours)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatHoursClock(r.workedHours)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {r.shiftCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {r.coveragePct != null ? `${r.coveragePct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Totals follow the location you select at the top of the page (all locations or one store). Coverage
        compares hours worked to hours scheduled—not how many people are on the team. For each
        clock-in and clock-out and for approvals, open Time Clock.
      </p>
    </div>
  );
}
