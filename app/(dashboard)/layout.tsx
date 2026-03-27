import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/dashboard/app-header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { displayNameFromUser } from "@/lib/auth/display-name";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import { resolveSelectedLocationId, type LocationRow } from "@/lib/dashboard/resolve-location";
import { getRbacContext } from "@/lib/rbac/context";
import { DASHBOARD_NAV, filterNavForRbac } from "@/lib/rbac/nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const displayName = displayNameFromUser(user);

  const rbacProfileHint =
    rbac.enabled && rbac.needsEmployeeProfile && user?.email
      ? "Your account isn’t linked to an employee profile yet. Ask an admin to add your work email in the directory."
      : null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AppSidebar navItems={navItems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          userEmail={user?.email ?? ""}
          displayName={displayName}
          locations={locations}
          selectedLocationId={selectedLocationId}
          showSignOut={Boolean(user?.email)}
          rbacProfileHint={rbacProfileHint}
        />
        <main className="flex-1 py-6">
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
