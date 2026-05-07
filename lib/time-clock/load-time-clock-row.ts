import type { SupabaseClient } from "@supabase/supabase-js";

const TIME_CLOCK_SELECT_FULL =
  "id, name, status, location_id, timesheet_period_kind, timesheet_period_config, location_tracking_mode, require_location_for_punch, categorization_mode, require_categorization, breaks_enabled, allow_paid_breaks, breaks_mode, breaks_manual_rules, breaks_auto_rules, work_days, work_hours_start, work_hours_end, daily_limit_enabled, daily_limit_hours, auto_clock_out_enabled, auto_clock_out_after_hours, allow_manager_edits";

const TIME_CLOCK_SELECT_MIN =
  "id, name, status, location_id, timesheet_period_kind, timesheet_period_config";

function isMissingColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? "").toLowerCase();
  // PostgREST / Postgres common shapes
  if (err.code === "42703") return true;
  if (msg.includes("column") && msg.includes("does not exist")) return true;
  if (msg.includes("could not find")) return true;
  return false;
}

export async function loadTimeClockRowForDetailPage(
  supabase: SupabaseClient,
  clockId: string,
): Promise<{ clock: unknown | null; error: { message: string; code?: string } | null }> {
  const full = await supabase.from("time_clocks").select(TIME_CLOCK_SELECT_FULL).eq("id", clockId).maybeSingle();

  if (!full.error) {
    return { clock: full.data, error: null };
  }

  if (isMissingColumnError(full.error)) {
    const min = await supabase.from("time_clocks").select(TIME_CLOCK_SELECT_MIN).eq("id", clockId).maybeSingle();
    return { clock: min.data, error: min.error ? { message: min.error.message, code: min.error.code } : null };
  }

  return { clock: null, error: { message: full.error.message, code: full.error.code } };
}
