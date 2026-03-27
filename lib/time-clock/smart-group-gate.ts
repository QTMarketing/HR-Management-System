import type { SupabaseClient } from "@supabase/supabase-js";

export type TimeClockSmartGateResult =
  | { kind: "open" }
  | { kind: "restricted"; allowedEmployeeIds: Set<string> }
  | { kind: "error"; message: string };

function isLikelyMissingSmartGroupTables(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("does not exist") || m.includes("42p01");
}

/**
 * If no `time_clock` rows in `smart_group_assignments` point at this clock, any employee
 * at the store may clock in (legacy behavior). Otherwise only members of those groups may.
 */
export async function getTimeClockSmartGate(
  supabase: SupabaseClient,
  timeClockId: string,
): Promise<TimeClockSmartGateResult> {
  const { data: assignRows, error: aErr } = await supabase
    .from("smart_group_assignments")
    .select("smart_group_id")
    .eq("assignment_type", "time_clock")
    .eq("time_clock_id", timeClockId);

  if (aErr) {
    if (isLikelyMissingSmartGroupTables(aErr.message)) {
      return { kind: "open" };
    }
    return { kind: "error", message: aErr.message };
  }

  const groupIds = [
    ...new Set((assignRows ?? []).map((r) => String((r as { smart_group_id: string }).smart_group_id))),
  ].filter(Boolean);

  if (groupIds.length === 0) {
    return { kind: "open" };
  }

  const { data: memRows, error: mErr } = await supabase
    .from("smart_group_members")
    .select("employee_id")
    .in("smart_group_id", groupIds);

  if (mErr) {
    if (isLikelyMissingSmartGroupTables(mErr.message)) {
      return { kind: "open" };
    }
    return { kind: "error", message: mErr.message };
  }

  const allowedEmployeeIds = new Set(
    (memRows ?? []).map((r) => String((r as { employee_id: string }).employee_id)),
  );

  return { kind: "restricted", allowedEmployeeIds };
}

export function isEmployeeAllowedOnTimeClock(
  gate: Exclude<TimeClockSmartGateResult, { kind: "error" }>,
  employeeId: string,
): boolean {
  if (gate.kind === "open") return true;
  return gate.allowedEmployeeIds.has(employeeId);
}
