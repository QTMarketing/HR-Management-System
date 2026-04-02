import { UsersSectionTabs } from "@/components/users/users-section-tabs";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function UsersAreaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  const showSmartGroups = !ctx.enabled || hasPermission(ctx, PERMISSIONS.USERS_GROUPS_VIEW);

  return (
    <div className="space-y-6">
      <UsersSectionTabs showSmartGroups={showSmartGroups} />
      {children}
    </div>
  );
}
