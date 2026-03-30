"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { addDays, parseWeekMondayParam } from "@/lib/schedule/week";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublishScheduleResult = { ok: true } | { ok: false; error: string };

/** Set `is_published = true` for draft shifts in the visible week and location scope. */
export async function publishDraftShiftsForWeek(
  weekParam: string | undefined,
): Promise<PublishScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (ctx.enabled && !hasPermission(ctx, PERMISSIONS.SCHEDULE_EDIT)) {
    return { ok: false, error: "You don’t have permission to publish the schedule." };
  }

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);

  const weekMonday = parseWeekMondayParam(weekParam);
  const weekEnd = addDays(weekMonday, 7);

  let q = supabase
    .from("shifts")
    .update({ is_published: true })
    .eq("is_published", false)
    .gte("shift_start", weekMonday.toISOString())
    .lt("shift_start", weekEnd.toISOString());

  if (!scopeAll) {
    q = q.eq("location_id", locationId);
  }

  const { error } = await q;
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/schedule/board");
  revalidatePath("/schedule");
  return { ok: true };
}
