import { cookies } from "next/headers";
import { getPtoPolicySummary } from "@/app/actions/pto-policy";
import { getTimeOffLedgerExportRows } from "@/app/actions/time-off-report";
import { TimeOffLedgerClient } from "@/components/time-off/time-off-ledger-client";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import { getRbacContext } from "@/lib/rbac/context";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HrTimeOffLedgerCsvRow } from "@/lib/csv/hr-ledger-csv";

function parseYearParam(raw: string | undefined): number {
  const thisYear = new Date().getFullYear();
  if (!raw) return thisYear;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return thisYear;
  return n;
}

export default async function TimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requirePermission(PERMISSIONS.TIME_CLOCK_MANAGE);

  const sp = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = parseYearParam(sp.year);

  const supabase = await createSupabaseServerClient();
  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .neq("status", "archived")
    .order("sort_order", { ascending: true });

  const locations: LocationRow[] = locationsForSession(
    (locRows ?? []).map((r) => ({ id: r.id, name: r.name })),
  );

  const cookieStore = await cookies();
  const selectedLocationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );

  const scopeAll = isAllLocations(selectedLocationId);
  const locationName =
    locations.find((l) => l.id === selectedLocationId)?.name ?? (scopeAll ? "All locations" : "Store");

  const ledgerLocationId = scopeAll ? "all" : selectedLocationId;

  const ledgerRes = await getTimeOffLedgerExportRows({
    locationId: ledgerLocationId,
    year,
  });

  const rows: HrTimeOffLedgerCsvRow[] = ledgerRes.ok ? ledgerRes.rows : [];
  const ledgerError = ledgerRes.ok ? null : ledgerRes.error;

  // Policy + Owner flag for the policy editor.
  const policyRes = await getPtoPolicySummary();
  const policy = policyRes.ok ? policyRes.policy : null;
  const policyError = policyRes.ok ? null : policyRes.error;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rbacCtx = await getRbacContext(supabase, user);
  const canEditPolicy = !rbacCtx.enabled || rbacCtx.roleKey === "owner";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Time Off</h1>
        <p className="mt-1 text-sm text-slate-600">
          Vacation and sick balances for{" "}
          <span className="font-medium text-slate-800">{locationName}</span>. Search, change the
          year, or download a report.
        </p>
      </div>

      {ledgerError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load balances: {ledgerError}
        </div>
      ) : null}

      {policyError && canEditPolicy ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Policy editor unavailable</p>
          <p className="mt-0.5">
            Could not load the time off policy: {policyError}. If this is the first time, apply
            migration{" "}
            <span className="font-mono text-amber-950">
              065_pto_policy_settings_and_rls.sql
            </span>{" "}
            to your database.
          </p>
        </div>
      ) : null}

      <TimeOffLedgerClient
        rows={rows}
        year={year}
        thisYear={thisYear}
        locationName={locationName}
        scopeAll={scopeAll}
        locationId={ledgerLocationId}
        policy={policy}
        canEditPolicy={canEditPolicy}
      />
    </div>
  );
}
