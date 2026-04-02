"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  type TimesheetPeriodConfig,
  type TimesheetPeriodKind,
  normalizePeriodConfig,
} from "@/lib/time-clock/timesheet-period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SavePeriodResult = { ok: true } | { ok: false; error: string };

async function gateManage() {
  const supabase = await createSupabaseServerClient();
  if (process.env.RBAC_ENABLED !== "true") {
    return { ok: true as const, supabase };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)) {
    return { ok: false as const, error: "You need time clock management permission to change settings." };
  }
  return { ok: true as const, supabase };
}

export async function saveTimeClockTimesheetPeriod(params: {
  timeClockId: string;
  timesheet_period_kind: TimesheetPeriodKind;
  timesheet_period_config: TimesheetPeriodConfig | null;
}): Promise<SavePeriodResult> {
  const gate = await gateManage();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const id = params.timeClockId?.trim();
  if (!id) return { ok: false, error: "Missing time clock." };

  const kind = params.timesheet_period_kind;
  if (!["weekly", "monthly", "semi_monthly", "custom"].includes(kind)) {
    return { ok: false, error: "Invalid period type." };
  }

  const config = normalizePeriodConfig(params.timesheet_period_config, kind);
  const payload =
    kind === "semi_monthly" || kind === "custom"
      ? { split_after_day: config.split_after_day ?? 15 }
      : null;

  const { error } = await supabase
    .from("time_clocks")
    .update({
      timesheet_period_kind: kind,
      timesheet_period_config: payload,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${id}`);
  return { ok: true };
}
