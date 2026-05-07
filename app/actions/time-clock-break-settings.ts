"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type BreakSettingsResult = { ok: true } | { ok: false; error: string };

export async function saveTimeClockBreakSettings(params: {
  timeClockId: string;
  breaks_enabled: boolean;
  allow_paid_breaks: boolean;
  breaks_mode: "disabled" | "manual" | "automatic";
  breaks_manual_rules: unknown;
  breaks_auto_rules: unknown;
}): Promise<BreakSettingsResult> {
  const timeClockId = params.timeClockId?.trim();
  if (!timeClockId) return { ok: false, error: "Missing time clock." };

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
      breaks_enabled: Boolean(params.breaks_enabled),
      allow_paid_breaks: Boolean(params.allow_paid_breaks),
      breaks_mode: params.breaks_mode,
      breaks_manual_rules: params.breaks_manual_rules ?? [],
      breaks_auto_rules: params.breaks_auto_rules ?? [],
    })
    .eq("id", timeClockId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${timeClockId}`);
  return { ok: true };
}

