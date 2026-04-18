"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type JobTitleRow = { id: string; name: string; active: boolean };

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function gateWrite(): Promise<ActionResult<null> | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  // Admins (store managers) should have users.manage; owners have org.owner.
  if (!hasPermission(ctx, PERMISSIONS.USERS_MANAGE) && !hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return { ok: false, error: "You don’t have permission to edit job titles." };
  }
  return null;
}

export async function listJobTitles(): Promise<ActionResult<JobTitleRow[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_titles")
    .select("id, name, active")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []).map((r) => r as JobTitleRow);
  return { ok: true, data: rows };
}

export async function createJobTitle(name: string): Promise<ActionResult<JobTitleRow>> {
  const g = await gateWrite();
  if (g) return g as ActionResult<JobTitleRow>;

  const cleaned = String(name ?? "").trim();
  if (!cleaned) return { ok: false, error: "Job title name is required." };

  const supabase = await createSupabaseServerClient();

  // Try find existing (case-insensitive) first.
  const { data: existing, error: exErr } = await supabase
    .from("job_titles")
    .select("id, name, active")
    .ilike("name", cleaned)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing) return { ok: true, data: existing as JobTitleRow };

  const { data, error } = await supabase
    .from("job_titles")
    .insert({ name: cleaned })
    .select("id, name, active")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/users");
  return { ok: true, data: data as JobTitleRow };
}

export async function setEmployeeJobTitles(
  employeeId: string,
  payload: { primaryJobTitleId: string | null; secondaryJobTitleId: string | null },
): Promise<ActionResult<null>> {
  const g = await gateWrite();
  if (g) return g;

  const id = employeeId?.trim();
  if (!id) return { ok: false, error: "Missing employee." };

  const primaryId = payload.primaryJobTitleId?.trim() || null;
  const secondaryId = payload.secondaryJobTitleId?.trim() || null;
  if (primaryId && secondaryId && primaryId === secondaryId) {
    return { ok: false, error: "Primary and secondary job titles must be different." };
  }

  const supabase = await createSupabaseServerClient();

  // Upsert rank 1 and rank 2 rows; delete when null.
  // Rank 1: primary
  if (primaryId) {
    const { error } = await supabase
      .from("employee_job_titles")
      .upsert({ employee_id: id, job_title_id: primaryId, rank: 1 }, { onConflict: "employee_id,rank" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("employee_job_titles").delete().eq("employee_id", id).eq("rank", 1);
    if (error) return { ok: false, error: error.message };
  }

  // Rank 2: secondary
  if (secondaryId) {
    const { error } = await supabase
      .from("employee_job_titles")
      .upsert({ employee_id: id, job_title_id: secondaryId, rank: 2 }, { onConflict: "employee_id,rank" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("employee_job_titles").delete().eq("employee_id", id).eq("rank", 2);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/users");
  return { ok: true, data: null };
}

