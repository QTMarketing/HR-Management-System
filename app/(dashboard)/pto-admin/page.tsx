import { redirect } from "next/navigation";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PtoRolloverCard } from "@/components/pto/pto-rollover-card";
import { PtoMonthlyCashoutCard } from "@/components/pto/pto-monthly-cashout-card";
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

  try {
    const [policyRow, locationsRes] = await Promise.all([
      getGlobalPayrollPolicy(supabase),
      supabase
        .from("locations")
        .select("id, name")
        .neq("status", "archived")
        .order("name", { ascending: true }),
    ]);
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
  } catch {
    // keep defaults / empty list
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings &amp; Administration</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Manage company-wide payroll rules, time-off rollovers, and vacation payouts.
        </p>
      </div>

      <PayrollRulesCard
        initial={globalPolicy}
        canEdit={!rbac.enabled || hasPermission(rbac, PERMISSIONS.ORG_OWNER)}
        locations={locations}
      />
      <PtoRolloverCard />
      <PtoMonthlyCashoutCard />
    </div>
  );
}

