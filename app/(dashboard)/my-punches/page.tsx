import Link from "next/link";
import { MyPunchesList } from "@/components/employee/my-punches-list";
import { loadMyPunches } from "@/lib/employee/load-my-punches";
import { getRbacContext } from "@/lib/rbac/context";
import { isEmployeePortalUser } from "@/lib/rbac/employee-portal";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MyPunchesPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbac = await getRbacContext(supabase, user);

  if (rbac.enabled && !isEmployeePortalUser(rbac) && !rbac.employeeId) {
    redirect("/");
  }

  const employeeId = rbac.employeeId;
  if (!employeeId) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-950">
        <p className="font-semibold">Profile not linked</p>
        <p className="mt-2">Ask HR to connect your login email to your employee record.</p>
      </div>
    );
  }

  const result = await loadMyPunches(supabase, employeeId);

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-4 sm:max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">My punches</h1>
        <p className="text-sm text-slate-600">
          Your clock-in and clock-out times for the last two weeks.
        </p>
        <Link
          href="/"
          className="inline-block text-sm font-semibold text-orange-700 underline-offset-2 hover:underline"
        >
          ← Back to Home
        </Link>
      </header>

      <MyPunchesList
        rows={result.ok ? result.rows : []}
        rangeLabel={result.ok ? result.rangeLabel : ""}
        error={result.ok ? null : result.error}
      />
    </div>
  );
}
