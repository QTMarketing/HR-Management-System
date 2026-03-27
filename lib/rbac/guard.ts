import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Permission } from "./permissions";
import { getRbacContext, hasPermission } from "./context";

/** Server-only: block when RBAC is on and the permission is missing. */
export async function requirePermission(permission: Permission): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);

  if (!ctx.enabled) return;

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(ctx, permission)) {
    redirect("/forbidden");
  }
}
