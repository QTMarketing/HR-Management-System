"use server";

import { revalidatePath, updateTag } from "next/cache";
import { timeClockTag } from "@/lib/cache/tags";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type GeneralSettingsResult = { ok: true } | { ok: false; error: string };

export async function saveTimeClockGeneralSettings(params: {
  timeClockId: string;
  work_days: number[];
  work_hours_start: string; // HH:mm
  work_hours_end: string; // HH:mm
  daily_limit_enabled: boolean;
  daily_limit_hours: number;
  auto_clock_out_enabled: boolean;
  auto_clock_out_after_hours: number;
  allow_manager_edits: boolean;
}): Promise<GeneralSettingsResult> {
  const timeClockId = params.timeClockId?.trim();
  if (!timeClockId) return { ok: false, error: "Missing time clock." };

  const days = (params.work_days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (days.length === 0) return { ok: false, error: "Select at least one work day." };

  const start = params.work_hours_start?.trim();
  const end = params.work_hours_end?.trim();
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return { ok: false, error: "Work hours must be in HH:mm format." };
  }

  const dailyLimitHours = Number(params.daily_limit_hours);
  const autoAfterHours = Number(params.auto_clock_out_after_hours);
  if (!Number.isFinite(dailyLimitHours) || dailyLimitHours <= 0) {
    return { ok: false, error: "Daily limit hours must be a positive number." };
  }
  if (!Number.isFinite(autoAfterHours) || autoAfterHours <= 0) {
    return { ok: false, error: "Auto clock-out hours must be a positive number." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  if (process.env.RBAC_ENABLED === "true") {
    const ctx = await getRbacContext(supabase, user);
    if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)) {
      return { ok: false, error: "You don’t have permission to update settings." };
    }
  }

  const { error } = await supabase
    .from("time_clocks")
    .update({
      work_days: days,
      work_hours_start: start,
      work_hours_end: end,
      daily_limit_enabled: Boolean(params.daily_limit_enabled),
      daily_limit_hours: dailyLimitHours,
      auto_clock_out_enabled: Boolean(params.auto_clock_out_enabled),
      auto_clock_out_after_hours: autoAfterHours,
      allow_manager_edits: Boolean(params.allow_manager_edits),
    })
    .eq("id", timeClockId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${timeClockId}`);
  updateTag(timeClockTag(timeClockId));
  return { ok: true };
}

