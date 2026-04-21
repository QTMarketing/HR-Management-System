"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SetupResult = { ok: true } | { ok: false; error: string };

async function gateManage(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  if (process.env.RBAC_ENABLED !== "true") {
    return { ok: true, supabase };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.TIME_CLOCK_MANAGE)) {
    return { ok: false, error: "You need time clock management permission to change setup." };
  }
  return { ok: true, supabase };
}

export async function saveTimeClockTrackingAndCategorization(params: {
  timeClockId: string;
  location_tracking_mode: "off" | "clock_in_out" | "breadcrumbs";
  require_location_for_punch: boolean;
  categorization_mode: "none" | "job" | "location";
  require_categorization: boolean;
}): Promise<SetupResult> {
  const gate = await gateManage();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const id = params.timeClockId?.trim();
  if (!id) return { ok: false, error: "Missing time clock." };

  const ltm = params.location_tracking_mode;
  if (!["off", "clock_in_out", "breadcrumbs"].includes(ltm)) {
    return { ok: false, error: "Invalid location tracking mode." };
  }
  const cm = params.categorization_mode;
  if (!["none", "job", "location"].includes(cm)) {
    return { ok: false, error: "Invalid categorization mode." };
  }

  const { error } = await supabase
    .from("time_clocks")
    .update({
      location_tracking_mode: ltm,
      require_location_for_punch: Boolean(params.require_location_for_punch),
      categorization_mode: cm,
      require_categorization: Boolean(params.require_categorization),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${id}`);
  return { ok: true };
}

