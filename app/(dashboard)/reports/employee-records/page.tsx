import { cookies } from "next/headers";
import { EmployeeRecordsHub } from "@/components/reports/employee-records-hub";
import { WeeklyLaborPanel } from "@/components/reports/weekly-labor-panel";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { loadWeeklyLaborReport } from "@/lib/reports/load-weekly-labor";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function parseYearParam(raw: string | undefined): number {
  const thisYear = new Date().getFullYear();
  if (!raw) return thisYear;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return thisYear;
  return n;
}

export default async function EmployeeRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbac = await getRbacContext(supabase, user);

  const canAccess =
    !rbac.enabled ||
    hasPermission(rbac, PERMISSIONS.USERS_VIEW) ||
    hasPermission(rbac, PERMISSIONS.LABOR_REPORT_VIEW);
  if (!canAccess) {
    redirect("/forbidden");
  }

  const sp = await searchParams;
  const year = parseYearParam(sp.year);

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .neq("status", "archived")
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
  const scopeLabel = scopeAll
    ? "All locations"
    : (locations.find((l) => l.id === locationId)?.name ?? "Selected store");

  const canLabor = !rbac.enabled || hasPermission(rbac, PERMISSIONS.LABOR_REPORT_VIEW);
  const labor = canLabor
    ? await loadWeeklyLaborReport(supabase, {
        locationId,
        scopeAll,
        locationLabel: scopeLabel,
      })
    : null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Employee records</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Click any report card to open a spreadsheet-style preview. Choose the period you need, review the
          data, then <strong>Download CSV</strong> or <strong>Print / PDF</strong> for filing.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Reports follow the store selector in the page header:{" "}
          <span className="font-medium text-slate-700">{scopeLabel}</span>.
        </p>
      </div>

      <EmployeeRecordsHub
        locationId={locationId}
        scopeAll={scopeAll}
        scopeLabel={scopeLabel}
        year={year}
        permissions={{
          usersView: !rbac.enabled || hasPermission(rbac, PERMISSIONS.USERS_VIEW),
          timeOffManage: !rbac.enabled || hasPermission(rbac, PERMISSIONS.TIME_CLOCK_MANAGE),
          laborReport: canLabor,
          orgOwner: !rbac.enabled || hasPermission(rbac, PERMISSIONS.ORG_OWNER),
          scheduleView: !rbac.enabled || hasPermission(rbac, PERMISSIONS.SCHEDULE_VIEW),
          activityView: !rbac.enabled || hasPermission(rbac, PERMISSIONS.ACTIVITY_VIEW),
        }}
      />

      {labor ? (
        <WeeklyLaborPanel
          weekMonday={labor.weekMonday}
          rangeLabel={labor.rangeLabel}
          scopeLabel={labor.scopeLabel}
          scheduledHours={labor.scheduledHours}
          workedHours={labor.workedHours}
          shiftCount={labor.shiftCount}
          coveragePct={labor.coveragePct}
          csvRows={labor.csvRows}
          csvMeta={labor.csvMeta}
          errorMessage={labor.errorMessage}
          canView={canLabor}
        />
      ) : null}
    </div>
  );
}
