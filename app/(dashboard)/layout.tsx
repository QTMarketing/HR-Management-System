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

  if (profileEmployeeId) {
    const { data: empGreet } = await supabase
      .from("employees")
      .select("first_name, last_name, full_name")
      .eq("id", profileEmployeeId)
      .maybeSingle();
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
  }

  const rbacProfileHint =
    rbac.enabled && rbac.needsEmployeeProfile && user?.email
      ? "Your account isn’t linked to an employee profile yet. Ask an admin to add your work email in the directory."
      : null;

  const mvpDemoRibbon = process.env.NEXT_PUBLIC_MVP_DEMO === "true";

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AppSidebar
        navItems={navItems}
        signedIn={Boolean(user)}
        myProfileHref={myProfileHref}
        profileUnlinked={profileUnlinked}
        userEmail={user?.email ?? ""}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {mvpDemoRibbon ? (
          <div className="border-b border-amber-500/50 bg-amber-950 px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide text-amber-50">
            MVP demo build — relaxed RBAC/RLS; not for production or sensitive data
          </div>
        ) : null}
        <AppHeader
          userEmail={user?.email ?? ""}
          displayName={displayName}
          locations={locations}
          selectedLocationId={selectedLocationId}
          signedIn={Boolean(user)}
          myProfileHref={myProfileHref}
          profileUnlinked={profileUnlinked}
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
