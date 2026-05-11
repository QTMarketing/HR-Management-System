"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  attachBreakRollups,
  enrichPunchRows,
} from "@/lib/time-clock/enrich-punches";
import type { TimeEntryBreakRow } from "@/lib/time-clock/breaks";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";

/**
 * Fetch + enrich one employee's punches inside a calendar range.
 *
 * Used by the calendar "jump to date / range" affordance on the live Punches
 * modal so the user can review history *without* navigating away. The shape
 * matches what `EmployeeTimecardModal` already renders, so the modal swaps in
 * the new rows transparently. The range is inclusive on both ends.
 */
export type GetEmployeePunchesInRangeResult =
  | { ok: true; rows: EnrichedPunchRow[]; rangeLabel: string }
  | { ok: false; error: string };

const TIME_ENTRY_SELECT =
  "id, employee_id, clock_in_at, clock_out_at, status, archived_at, approved_at, punch_source, job_code, job_code_id, location_code_id, job_codes(label), location_codes(label), edited_at, edit_reason";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseYmd(ymd: string): Date | null {
  if (!YMD_RE.test(ymd)) return null;
  const [yy, mm, dd] = ymd.split("-").map(Number);
  return new Date(yy, (mm ?? 1) - 1, dd ?? 1, 0, 0, 0, 0);
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function rangeLabelFor(start: Date, endInclusive: Date): string {
  const sameDay =
    start.getFullYear() === endInclusive.getFullYear() &&
    start.getMonth() === endInclusive.getMonth() &&
    start.getDate() === endInclusive.getDate();
  return sameDay ? fmtShort(start) : `${fmtShort(start)} – ${fmtShort(endInclusive)}`;
}

export async function getEmployeePunchesInRange(input: {
  employeeId: string;
  fromYmd: string;
  toYmd: string;
}): Promise<GetEmployeePunchesInRangeResult> {
  const empId = input.employeeId?.trim();
  if (!empId) return { ok: false, error: "Missing employee id." };

  const fromYmd = input.fromYmd?.trim() ?? "";
  const toYmd = input.toYmd?.trim() ?? "";
  const fromDate = parseYmd(fromYmd);
  const toDate = parseYmd(toYmd);
  if (!fromDate || !toDate) return { ok: false, error: "Invalid date range." };

  // Allow callers to pass either order; we normalize so `start <= end`.
  const [startDate, endInclusiveDate] =
    fromDate.getTime() <= toDate.getTime()
      ? [fromDate, toDate]
      : [toDate, fromDate];

  // Exclusive upper bound (next day at 00:00 local) so the `< endIso` filter
  // includes the entire end day. Mirrors `getLocalDayBounds` semantics.
  const exclusiveEnd = new Date(endInclusiveDate);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);

  const startIso = startDate.toISOString();
  const endIso = exclusiveEnd.toISOString();

  const supabase = await createSupabaseServerClient();

  const { data: empRow, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, role")
    .eq("id", empId)
    .maybeSingle();
  if (empErr) return { ok: false, error: empErr.message };

  const nameById = new Map<string, string>();
  const roleById = new Map<string, string>();
  if (empRow) {
    nameById.set(
      (empRow as { id: string }).id,
      (empRow as { full_name?: string | null }).full_name ?? "—",
    );
    roleById.set(
      (empRow as { id: string }).id,
      (empRow as { role?: string | null }).role ?? "—",
    );
  }

  const { data: rawRows, error: peErr } = await supabase
    .from("time_entries")
    .select(TIME_ENTRY_SELECT)
    .eq("employee_id", empId)
    .is("archived_at", null)
    .gte("clock_in_at", startIso)
    .lt("clock_in_at", endIso)
    .order("clock_in_at", { ascending: true });
  if (peErr) return { ok: false, error: peErr.message };

  const { data: shiftsRaw, error: shErr } = await supabase
    .from("shifts")
    .select("employee_id, shift_start, shift_end, notes")
    .eq("employee_id", empId)
    .gte("shift_start", startIso)
    .lt("shift_start", endIso);
  if (shErr) return { ok: false, error: shErr.message };
  const shifts = (shiftsRaw ?? []) as {
    employee_id: string;
    shift_start: string;
    shift_end: string;
    notes: string | null;
  }[];

  // `enrichPunchRows` keeps its raw row type internal; relying on the
  // shape of the select string above is enough at runtime.
  const enriched = enrichPunchRows(
    (rawRows ?? []) as Parameters<typeof enrichPunchRows>[0],
    nameById,
    roleById,
    shifts,
  );

  const label = rangeLabelFor(startDate, endInclusiveDate);

  if (enriched.length === 0) {
    return { ok: true, rows: enriched, rangeLabel: label };
  }

  const entryIds = enriched.map((r) => r.id);
  const { data: breaksRaw } = await supabase
    .from("time_entry_breaks")
    .select("id, time_entry_id, started_at, ended_at, is_paid")
    .in("time_entry_id", entryIds);

  const breaksByEntry = new Map<string, TimeEntryBreakRow[]>();
  for (const b of (breaksRaw ?? []) as TimeEntryBreakRow[]) {
    const arr = breaksByEntry.get(b.time_entry_id) ?? [];
    arr.push(b);
    breaksByEntry.set(b.time_entry_id, arr);
  }

  const withBreaks = attachBreakRollups(enriched, breaksByEntry, new Date());
  return { ok: true, rows: withBreaks, rangeLabel: label };
}
