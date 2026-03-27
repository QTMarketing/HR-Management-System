"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const COLORS = new Set(["slate", "violet", "amber", "blue", "rose", "emerald"]);

async function gateManage(): Promise<ActionResult> {
  if (process.env.RBAC_ENABLED !== "true") return { ok: true };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.USERS_MANAGE)) {
    return { ok: false, error: "You need users.manage permission to change smart groups." };
  }
  return { ok: true };
}

export async function createGroupSegment(
  name: string,
  colorToken: string,
  locationId: string | null,
  sortOrder: number,
): Promise<ActionResult<{ id: string }>> {
  const g = await gateManage();
  if (!g.ok) return g;

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Segment name is required." };
  const color = COLORS.has(colorToken) ? colorToken : "slate";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("group_segments")
    .insert({
      name: trimmed,
      color_token: color,
      location_id: locationId || null,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  revalidatePath("/users/groups");
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteGroupSegment(segmentId: string): Promise<ActionResult> {
  const g = await gateManage();
  if (!g.ok) return g;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("group_segments").delete().eq("id", segmentId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/users/groups");
  return { ok: true };
}

export async function createSmartGroup(segmentId: string, name: string): Promise<ActionResult> {
  const g = await gateManage();
  if (!g.ok) return g;

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Group name is required." };

  const supabase = await createSupabaseServerClient();

  const { data: maxRow } = await supabase
    .from("smart_groups")
    .select("sort_order")
    .eq("segment_id", segmentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder =
    maxRow && typeof (maxRow as { sort_order: number }).sort_order === "number"
      ? (maxRow as { sort_order: number }).sort_order + 1
      : 0;

  const { error } = await supabase.from("smart_groups").insert({
    segment_id: segmentId,
    name: trimmed,
    sort_order: nextOrder,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/users/groups");
  return { ok: true };
}

export async function deleteSmartGroup(groupId: string): Promise<ActionResult> {
  const g = await gateManage();
  if (!g.ok) return g;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("smart_groups").delete().eq("id", groupId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/users/groups");
  return { ok: true };
}

export async function setSmartGroupMember(
  groupId: string,
  employeeId: string,
  member: boolean,
): Promise<ActionResult> {
  const g = await gateManage();
  if (!g.ok) return g;

  const supabase = await createSupabaseServerClient();

  if (member) {
    const { error } = await supabase.from("smart_group_members").upsert(
      {
        smart_group_id: groupId,
        employee_id: employeeId,
      },
      { onConflict: "smart_group_id,employee_id" },
    );
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("smart_group_members")
      .delete()
      .eq("smart_group_id", groupId)
      .eq("employee_id", employeeId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/users/groups");
  return { ok: true };
}

export async function setSmartGroupAdmin(
  groupId: string,
  employeeId: string,
  admin: boolean,
): Promise<ActionResult> {
  const g = await gateManage();
  if (!g.ok) return g;

  const supabase = await createSupabaseServerClient();

  if (admin) {
    const { error } = await supabase.from("smart_group_admins").upsert(
      {
        smart_group_id: groupId,
        employee_id: employeeId,
      },
      { onConflict: "smart_group_id,employee_id" },
    );
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("smart_group_admins")
      .delete()
      .eq("smart_group_id", groupId)
      .eq("employee_id", employeeId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/users/groups");
  return { ok: true };
}

export async function setTimeClockAssignment(
  groupId: string,
  timeClockId: string,
  on: boolean,
): Promise<ActionResult> {
  const g = await gateManage();
  if (!g.ok) return g;

  const supabase = await createSupabaseServerClient();

  if (on) {
    const { error } = await supabase.from("smart_group_assignments").insert({
      smart_group_id: groupId,
      assignment_type: "time_clock",
      time_clock_id: timeClockId,
      location_id: null,
    });
    if (error && error.code !== "23505") {
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await supabase
      .from("smart_group_assignments")
      .delete()
      .eq("smart_group_id", groupId)
      .eq("assignment_type", "time_clock")
      .eq("time_clock_id", timeClockId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/users/groups");
  revalidatePath("/time-clock");
  return { ok: true };
}

export async function setScheduleAssignment(
  groupId: string,
  locationId: string,
  on: boolean,
): Promise<ActionResult> {
  const g = await gateManage();
  if (!g.ok) return g;

  const supabase = await createSupabaseServerClient();

  if (on) {
    const { error } = await supabase.from("smart_group_assignments").insert({
      smart_group_id: groupId,
      assignment_type: "schedule",
      time_clock_id: null,
      location_id: locationId,
    });
    if (error && !error.message.toLowerCase().includes("duplicate") && error.code !== "23505") {
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await supabase
      .from("smart_group_assignments")
      .delete()
      .eq("smart_group_id", groupId)
      .eq("assignment_type", "schedule")
      .eq("location_id", locationId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/users/groups");
  revalidatePath("/schedule");
  return { ok: true };
}
