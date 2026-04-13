"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

function slugifyBase(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "clock";
}

async function assertCanManage(): Promise<
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
    return { ok: false, error: "You don’t have permission to manage time clocks." };
  }
  return { ok: true, supabase };
}

async function uniqueSlugForLocation(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  locationId: string,
  base: string,
): Promise<string> {
  let slug = base;
  let n = 0;
  for (;;) {
    const { data } = await supabase
      .from("time_clocks")
      .select("id")
      .eq("location_id", locationId)
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export async function createTimeClock(params: {
  locationId: string;
  name: string;
}): Promise<ActionResult> {
  const gate = await assertCanManage();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const name = params.name.trim();
  if (!name) {
    return { ok: false, error: "Clock name is required." };
  }

  const { data: loc, error: locErr } = await supabase
    .from("locations")
    .select("id")
    .eq("id", params.locationId)
    .maybeSingle();

  if (locErr || !loc) {
    return { ok: false, error: locErr?.message ?? "Store not found." };
  }

  const base = slugifyBase(name);
  const slug = await uniqueSlugForLocation(supabase, params.locationId, base);

  const { data: maxRow } = await supabase
    .from("time_clocks")
    .select("sort_order")
    .eq("location_id", params.locationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const { error: insErr } = await supabase.from("time_clocks").insert({
    location_id: params.locationId,
    name,
    slug,
    status: "active",
    sort_order: sortOrder,
  });

  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/time-clock");
  revalidatePath("/users/groups");
  return { ok: true };
}

export async function archiveTimeClock(timeClockId: string): Promise<ActionResult> {
  const gate = await assertCanManage();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { data: row, error: fetchErr } = await supabase
    .from("time_clocks")
    .select("id, status")
    .eq("id", timeClockId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message ?? "Time clock not found." };
  }

  if ((row as { status: string }).status === "archived") {
    return { ok: false, error: "This clock is already archived." };
  }

  const { error: upErr } = await supabase
    .from("time_clocks")
    .update({ status: "archived" })
    .eq("id", timeClockId);

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${timeClockId}`);
  revalidatePath("/users/groups");
  return { ok: true };
}

export async function updateTimeClockName(params: {
  timeClockId: string;
  name: string;
}): Promise<ActionResult> {
  const gate = await assertCanManage();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const name = params.name.trim();
  if (!name) {
    return { ok: false, error: "Clock name is required." };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("time_clocks")
    .select("id")
    .eq("id", params.timeClockId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message ?? "Time clock not found." };
  }

  const { error: upErr } = await supabase
    .from("time_clocks")
    .update({ name })
    .eq("id", params.timeClockId);

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${params.timeClockId}`);
  revalidatePath("/users/groups");
  return { ok: true };
}

export async function unarchiveTimeClock(timeClockId: string): Promise<ActionResult> {
  const gate = await assertCanManage();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { data: row, error: fetchErr } = await supabase
    .from("time_clocks")
    .select("id, status")
    .eq("id", timeClockId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message ?? "Time clock not found." };
  }

  if ((row as { status: string }).status !== "archived") {
    return { ok: false, error: "This clock is not archived." };
  }

  const { error: upErr } = await supabase
    .from("time_clocks")
    .update({ status: "active" })
    .eq("id", timeClockId);

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${timeClockId}`);
  revalidatePath("/users/groups");
  return { ok: true };
}

export async function duplicateTimeClock(timeClockId: string): Promise<ActionResult> {
  const gate = await assertCanManage();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { data: src, error: fetchErr } = await supabase
    .from("time_clocks")
    .select("location_id, name")
    .eq("id", timeClockId)
    .maybeSingle();

  if (fetchErr || !src) {
    return { ok: false, error: fetchErr?.message ?? "Time clock not found." };
  }

  const rec = src as { location_id: string; name: string };
  const copyLabel = `${rec.name} (copy)`;
  const base = slugifyBase(copyLabel);
  const slug = await uniqueSlugForLocation(supabase, rec.location_id, base);

  const { data: maxRow } = await supabase
    .from("time_clocks")
    .select("sort_order")
    .eq("location_id", rec.location_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const { error: insErr } = await supabase.from("time_clocks").insert({
    location_id: rec.location_id,
    name: copyLabel,
    slug,
    status: "active",
    sort_order: sortOrder,
  });

  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/time-clock");
  revalidatePath("/users/groups");
  return { ok: true };
}

export async function deleteTimeClock(timeClockId: string): Promise<ActionResult> {
  const gate = await assertCanManage();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { count, error: countErr } = await supabase
    .from("time_entries")
    .select("*", { count: "exact", head: true })
    .eq("time_clock_id", timeClockId);

  if (countErr) {
    return { ok: false, error: countErr.message };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "This clock has logged time and can’t be deleted. Archive it instead, or remove entries first.",
    };
  }

  const { error: delErr } = await supabase.from("time_clocks").delete().eq("id", timeClockId);

  if (delErr) {
    return { ok: false, error: delErr.message };
  }

  revalidatePath("/time-clock");
  revalidatePath(`/time-clock/${timeClockId}`);
  revalidatePath("/users/groups");
  return { ok: true };
}
