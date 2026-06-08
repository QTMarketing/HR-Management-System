import { redirect } from "next/navigation";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PtoRolloverCard } from "@/components/pto/pto-rollover-card";
import { PtoAutomationCard } from "@/components/pto/pto-automation-card";
import { PtoMonthlyCashoutCard } from "@/components/pto/pto-monthly-cashout-card";
import { loadPtoAutomationPageData } from "@/app/actions/pto-automation";
import {
  PayrollRulesCard,
  type PayrollRulesLocationOption,
} from "@/components/pto/payroll-rules-card";
import { getGlobalPayrollPolicy } from "@/lib/payroll/policy";
import { DEFAULT_PAYROLL_POLICY } from "@/lib/payroll/payable-hours";

export const dynamic = "force-dynamic";

export default async function PtoAdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rbac = await getRbacContext(supabase, user);
  if (rbac.enabled && !hasPermission(rbac, PERMISSIONS.ORG_OWNER)) {
    redirect("/forbidden");
  }

  // Track C: load the global OT policy + the list of stores so the
  // PayrollRulesCard can offer per-location overrides.
  let globalPolicy: {
    weeklyOtThreshold: number;
    dailyOtThreshold: number | null;
    otMultiplier: number;
    updatedAt: string | null;
  } = {
    weeklyOtThreshold: DEFAULT_PAYROLL_POLICY.weeklyOtThreshold,
    dailyOtThreshold: DEFAULT_PAYROLL_POLICY.dailyOtThreshold,
    otMultiplier: DEFAULT_PAYROLL_POLICY.otMultiplier,
    updatedAt: null,
  };
  let locations: PayrollRulesLocationOption[] = [];
  let overrideLocationIds: string[] = [];
  let automationData = { settings: null, recentRuns: [] } as Awaited<
    ReturnType<typeof loadPtoAutomationPageData>
  >;

  try {
    const [policyRow, locationsRes, overridesRes, autoData] = await Promise.all([
      getGlobalPayrollPolicy(supabase),
      supabase
        .from("locations")
        .select("id, name")
        .neq("status", "archived")
        .order("name", { ascending: true }),
      supabase.from("payroll_policies").select("location_id").not("location_id", "is", null),
      loadPtoAutomationPageData(),
    ]);
    automationData = autoData;
    if (policyRow) {
      globalPolicy = {
        weeklyOtThreshold: policyRow.weekly_ot_threshold,
        dailyOtThreshold: policyRow.daily_ot_threshold,
        otMultiplier: policyRow.ot_multiplier,
        updatedAt: policyRow.updated_at ?? null,
      };
    }
    if (!locationsRes.error && locationsRes.data) {
      locations = (locationsRes.data as { id: string; name: string }[]).map((l) => ({
        id: l.id,
        name: l.name,
      }));
    }
    if (!overridesRes.error && overridesRes.data) {
      overrideLocationIds = (overridesRes.data as { location_id: string }[])
        .map((r) => r.location_id)
        .filter(Boolean);
    }
  } catch {
    // keep defaults / empty list
  }

  const canEdit = !rbac.enabled || hasPermission(rbac, PERMISSIONS.ORG_OWNER);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">PTO admin</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Configure how employees earn and use paid time off, set overtime rules for payroll exports,
          and run year-end or monthly payout processes when needed.
        </p>
      </div>

      <PayrollRulesCard
        initial={globalPolicy}
        canEdit={canEdit}
        locations={locations}
        overrideLocationIds={overrideLocationIds}
      />
      <PtoAutomationCard initial={automationData} canEdit={canEdit} />

      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Manual processing</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Run year-end balance resets or monthly vacation payouts on demand. Safe to run again —
            duplicate entries are prevented.
          </p>
        </div>
        <PtoRolloverCard />
        <PtoMonthlyCashoutCard />
      </div>
    </div>
  );
}

