"use server";

import { revalidatePath, updateTag } from "next/cache";
import { timeClockTag } from "@/lib/cache/tags";
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

  /*
   * Defense-in-depth: refuse to persist `breaks_mode = 'automatic'` until
   * payroll actually enforces auto-deduct rules. The UI hides this radio,
   * but a hand-crafted POST should still bounce. Coerce historical values
   * back to "manual" rather than rejecting outright so an old row resaving
   * doesn't error.
   */
  const requestedMode =
    params.breaks_mode === "automatic" ? "manual" : params.breaks_mode;
  if (!["disabled", "manual"].includes(requestedMode)) {
    return { ok: false, error: "Pick Disabled or Manual breaks." };
  }

  const { error } = await supabase
    .from("time_clocks")
    .update({
      breaks_enabled: Boolean(params.breaks_enabled),
      allow_paid_breaks: Boolean(params.allow_paid_breaks),
      breaks_mode: requestedMode,
      breaks_manual_rules: params.breaks_manual_rules ?? [],
      // Always clear auto rules when saving — they have no consumer today,
      // so persisting old config would be misleading.
      breaks_auto_rules: [],
    })
    .eq("id", timeClockId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${timeClockId}`);
  // Tag-based fan-out so mobile widgets reading via `unstable_cache` pick up
  // the new break rules instantly (the old path-only invalidation only hit
  // the dashboard surface, not future API readers).
  updateTag(timeClockTag(timeClockId));
  return { ok: true };
}

