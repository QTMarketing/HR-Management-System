"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext } from "@/lib/rbac/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NotificationActionResult = { ok: true } | { ok: false; error: string };

/** Resolve the currently-signed-in employee id (email match), with the same fallback the dashboard uses. */
async function resolveCurrentEmployeeId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const ctx = await getRbacContext(supabase, user);
  if (ctx.employeeId) return ctx.employeeId;

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) return null;

  const { data } = await supabase
    .from("employees")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  return ((data as { id?: string } | null)?.id ?? null) as string | null;
}

/** Mark a single notification as read. RLS guarantees the row belongs to the caller. */
export async function markNotificationRead(
  notificationId: string,
): Promise<NotificationActionResult> {
  if (!notificationId?.trim()) {
    return { ok: false, error: "Missing notification id." };
  }

  const supabase = await createSupabaseServerClient();
  const employeeId = await resolveCurrentEmployeeId(supabase);
  if (!employeeId) {
    return { ok: false, error: "Sign in to manage notifications." };
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Mark every unread notification for the caller as read. */
export async function markAllNotificationsRead(): Promise<NotificationActionResult> {
  const supabase = await createSupabaseServerClient();
  const employeeId = await resolveCurrentEmployeeId(supabase);
  if (!employeeId) {
    return { ok: false, error: "Sign in to manage notifications." };
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("employee_id", employeeId)
    .eq("is_read", false);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
