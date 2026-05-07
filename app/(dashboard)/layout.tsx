import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { NotificationBellItem } from "@/components/layout/notification-bell";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { getRbacContext } from "@/lib/rbac/context";
import { DASHBOARD_NAV, filterNavForRbac } from "@/lib/rbac/nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Cookie + session + Supabase — must not be statically prerendered at build time. */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rbac = await getRbacContext(supabase, user);
  if (rbac.enabled && !user) {
    redirect("/login");
  }

  const navItems = filterNavForRbac(rbac, DASHBOARD_NAV).map(({ href, label, group }) => ({
    href,
    label,
    group: group ?? "main",
  }));

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .neq("status", "archived")
    .order("sort_order", { ascending: true });

  const locations: LocationRow[] = locationsForSession(
    (locRows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
    })),
  );

  const cookieStore = await cookies();
  const selectedLocationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );

  let displayName = displayNameFromUser(user);
  let profileEmployeeId = rbac.employeeId;
  const emailNorm = user?.email?.trim().toLowerCase() ?? "";
  if (!profileEmployeeId && emailNorm) {
    const { data: empLink } = await supabase
      .from("employees")
      .select("id")
      .ilike("email", emailNorm)
      .maybeSingle();
    profileEmployeeId = (empLink as { id?: string } | null)?.id ?? null;
  }
  const myProfileHref = profileEmployeeId ? `/users/${profileEmployeeId}` : null;
  const profileUnlinked = Boolean(user) && Boolean(emailNorm) && !myProfileHref;

  let notificationItems: NotificationBellItem[] = [];
  let unreadNotificationCount = 0;
  if (profileEmployeeId) {
    // Greeting + notifications can run in parallel — both gated on profileEmployeeId only.
    const [greetRes, recentRes, unreadCountRes] = await Promise.all([
      supabase
        .from("employees")
        .select("first_name, last_name, full_name")
        .eq("id", profileEmployeeId)
        .maybeSingle(),
      supabase
        .from("notifications")
        .select("id, title, message, link, is_read, created_at")
        .eq("employee_id", profileEmployeeId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", profileEmployeeId)
        .eq("is_read", false),
    ]);

    const empGreet = greetRes.data;
    if (empGreet) {
      const er = empGreet as {
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
      };
      const fn = er.first_name?.trim() ?? "";
      const ln = er.last_name?.trim() ?? "";
      const combined = [fn, ln].filter(Boolean).join(" ").trim();
      if (combined) displayName = combined;
      else if (er.full_name?.trim()) displayName = er.full_name.trim();
    }

    if (!recentRes.error && Array.isArray(recentRes.data)) {
      notificationItems = recentRes.data.map((r) => ({
        id: (r as { id: string }).id,
        title: (r as { title: string }).title,
        message: (r as { message: string }).message,
        link: ((r as { link?: string | null }).link ?? null) as string | null,
        is_read: Boolean((r as { is_read?: boolean }).is_read),
        created_at: (r as { created_at: string }).created_at,
      }));
    }
    if (!unreadCountRes.error) {
      unreadNotificationCount = unreadCountRes.count ?? 0;
    }
  }

  const rbacProfileHint =
    rbac.enabled && rbac.needsEmployeeProfile && user?.email
      ? "Your account isn’t linked to an employee profile yet. Ask an admin to add your work email in the directory."
      : null;

  const mvpDemoRibbon = process.env.NEXT_PUBLIC_MVP_DEMO === "true";

  return (
    <DashboardShell
      navItems={navItems}
      signedIn={Boolean(user)}
      myProfileHref={myProfileHref}
      profileUnlinked={profileUnlinked}
      userEmail={user?.email ?? ""}
      mvpDemoRibbon={mvpDemoRibbon}
      header={{
        userEmail: user?.email ?? "",
        displayName,
        locations,
        selectedLocationId,
        signedIn: Boolean(user),
        myProfileHref,
        profileUnlinked,
        rbacProfileHint,
        notifications: notificationItems,
        unreadNotificationCount,
      }}
    >
      {children}
    </DashboardShell>
  );
}
