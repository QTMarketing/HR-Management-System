"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LocationStatus = "running" | "not_running" | "archived";

export type LocationStatusResult = { ok: true } | { ok: false; error: string };

async function gate(): Promise<LocationStatusResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.USERS_MANAGE) && !hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return { ok: false, error: "You don’t have permission to update stores." };
  }
  return null;
}

export async function setLocationStatus(
  locationId: string,
  status: LocationStatus,
): Promise<LocationStatusResult> {
  const g = await gate();
  if (g) return g;

  const id = locationId?.trim();
  if (!id) return { ok: false, error: "Missing location." };
  if (status !== "running" && status !== "not_running" && status !== "archived") {
    return { ok: false, error: "Invalid status." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: loc, error: fetchErr } = await supabase
    .from("locations")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!loc) return { ok: false, error: "Location not found." };

  const prev = String((loc as { status?: string }).status ?? "running");
  if (status === "archived" && prev !== "not_running") {
    return { ok: false, error: "Only stores marked as not running can be archived." };
  }

  let archived_at: string | null = null;
  let archived_by: string | null = null;
  if (status === "archived") {
    archived_at = new Date().toISOString();
    // Best-effort: if we can map actor email to employees row, store it; otherwise null.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const emailNorm = user?.email?.trim().toLowerCase() ?? "";
    if (emailNorm) {
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .ilike("email", emailNorm)
        .maybeSingle();
      archived_by = (emp as { id?: string } | null)?.id ?? null;
    }
  } else if (prev === "archived") {
    // Unarchiving clears archive metadata.
    archived_at = null;
    archived_by = null;
  }

  const { error: updErr } = await supabase
    .from("locations")
    .update({
      status,
      archived_at,
      archived_by,
    })
    .eq("id", id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/locations");
  return { ok: true };
}

