import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, hoursBetween, hoursInWindow, mondayOfWeekContaining } from "@/lib/schedule/week";
import type { LaborWeekCsvMeta, LaborWeekCsvRow } from "@/lib/reports/labor-week-csv";

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

export type WeeklyLaborLoadResult = {
  errorMessage: string | null;
  weekMonday: Date;
  rangeLabel: string;
  scopeLabel: string;
  scheduledHours: number;
  workedHours: number;
  shiftCount: number;
  coveragePct: number | null;
  csvRows: LaborWeekCsvRow[];
  csvMeta: LaborWeekCsvMeta;
};

export async function loadWeeklyLaborReport(
  supabase: SupabaseClient,
  options: { locationId: string; scopeAll: boolean; locationLabel: string; weekMonday?: Date },
): Promise<WeeklyLaborLoadResult> {
  const weekMonday = options.weekMonday ?? mondayOfWeekContaining(new Date());
  const weekEnd = addDays(weekMonday, 7);
  const rangeLabel = `${weekMonday.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${addDays(weekMonday, 6).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
  const scopeLabel = options.scopeAll ? "All locations" : options.locationLabel;

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
    if (!options.scopeAll) {
      shiftQ = shiftQ.eq("location_id", options.locationId);
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
    if (!options.scopeAll) {
      entryQ = entryQ.eq("location_id", options.locationId);
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
      employeesById = new Map(((emps ?? []) as EmployeeLite[]).map((e) => [e.id, e]));
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
    scopeLabel,
    totals: {
      scheduledHours,
      workedHours,
      shiftCount,
      coveragePct,
    },
  };

  return {
    errorMessage,
    weekMonday,
    rangeLabel,
    scopeLabel,
    scheduledHours,
    workedHours,
    shiftCount,
    coveragePct,
    csvRows,
    csvMeta,
  };
}
