import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnrichedPunchRow, TimeClockTodayMetrics } from "@/lib/time-clock/types";
import { enrichPunchRows, mergeLatestPunchesWithStoreRoster, computeTodayMetrics } from "@/lib/time-clock/enrich-punches";
import { getLocalDayBounds } from "@/lib/time-clock/punch-display";
import { takeLatestPunchPerEmployee } from "@/lib/time-clock/dedupe-punches";

const TIME_ENTRY_SELECT =
  "id, employee_id, clock_in_at, clock_out_at, status, archived_at, approved_at, punch_source, job_code, job_code_id, location_code_id, job_codes(label), location_codes(label), edited_at, edit_reason";

export type StoreEmployeeLite = { id: string; fullName: string; role: string };

export type LoadTimeClockTodayResult = {
  latestPerEmployeeRows: EnrichedPunchRow[];
  clockedInNowRows: EnrichedPunchRow[];
  todayMetrics: TimeClockTodayMetrics;
};

/**
 * Single source of truth for Today tab time-entry data.
 * - Latest-per-employee list powers the main table (plus roster merge).
 * - Open entries powers "Clocked in now".
 * - Metrics derived from day-bounded punches + open count.
 */
export async function loadTimeClockTodayData(
  supabase: SupabaseClient,
  params: {
    timeClockId: string;
    locationId: string;
    nameById: Map<string, string>;
    roleById: Map<string, string>;
    storeEmployees: StoreEmployeeLite[];
    shiftsList: { employee_id: string; shift_start: string; shift_end: string; notes: string | null }[];
  },
): Promise<LoadTimeClockTodayResult> {
  const { timeClockId, locationId, nameById, roleById, storeEmployees, shiftsList } = params;
  const { start: dayStart, end: dayEnd } = getLocalDayBounds();

  // 1) Latest per employee for this clock (RPC, fallback to query + dedupe).
  let latestRaw: any[] = [];
  const { data: rpcRows, error: rpcErr } = await supabase.rpc(
    "time_entries_latest_per_employee_for_clock",
    { p_time_clock_id: timeClockId, p_location_id: locationId },
  );
  if (!rpcErr && Array.isArray(rpcRows)) {
    latestRaw = rpcRows as any[];
  } else {
    const { data: fallbackRaw, error: fbErr } = await supabase
      .from("time_entries")
      .select(TIME_ENTRY_SELECT)
      .eq("location_id", locationId)
      .eq("time_clock_id", timeClockId)
      .is("archived_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(1200);
    if (fbErr) {
      throw new Error(rpcErr?.message ?? fbErr.message);
    }
    latestRaw = takeLatestPunchPerEmployee(fallbackRaw ?? []);
  }

  const latestEnriched = enrichPunchRows(latestRaw as any[], nameById, roleById, shiftsList);
  const latestWithRoster = mergeLatestPunchesWithStoreRoster(
    latestEnriched,
    storeEmployees.map((e) => ({ id: e.id, fullName: e.fullName, role: e.role })),
    new Date(),
  );

  // 2) Day-bounded punches for metrics (only real punches, not placeholders).
  const { data: dayRaw, error: dayErr } = await supabase
    .from("time_entries")
    .select(TIME_ENTRY_SELECT)
    .eq("time_clock_id", timeClockId)
    .is("archived_at", null)
    .gte("clock_in_at", dayStart.toISOString())
    .lt("clock_in_at", dayEnd.toISOString());
  if (dayErr) throw new Error(dayErr.message);

  // 3) Open entries (now).
  const { data: openRaw, error: openErr } = await supabase
    .from("time_entries")
    .select(TIME_ENTRY_SELECT)
    .eq("time_clock_id", timeClockId)
    .eq("location_id", locationId)
    .eq("status", "open")
    .is("archived_at", null)
    .order("clock_in_at", { ascending: true });
  if (openErr) throw new Error(openErr.message);

  const enrichedDay = enrichPunchRows((dayRaw ?? []) as any[], nameById, roleById, shiftsList);
  const enrichedOpen = enrichPunchRows((openRaw ?? []) as any[], nameById, roleById, shiftsList);

  const shiftsToday = shiftsList.filter((s) => {
    const t = new Date(s.shift_start);
    return t >= dayStart && t < dayEnd;
  });

  return {
    latestPerEmployeeRows: latestWithRoster.sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" }),
    ),
    clockedInNowRows: enrichedOpen,
    todayMetrics: computeTodayMetrics(shiftsToday, enrichedDay, enrichedOpen.length),
  };
}

