import { redirect } from "next/navigation";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PtoRolloverCard } from "@/components/pto/pto-rollover-card";
import { PtoMonthlyCashoutCard } from "@/components/pto/pto-monthly-cashout-card";
import { PayrollRulesCard } from "@/components/pto/payroll-rules-card";
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

  // Track C: load the global OT policy. Defensive defaults so this page still
  // renders cleanly even if migration 070 hasn't been applied yet.
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
  try {
    const row = await getGlobalPayrollPolicy(supabase);
    if (row) {
      globalPolicy = {
        weeklyOtThreshold: row.weekly_ot_threshold,
        dailyOtThreshold: row.daily_ot_threshold,
        otMultiplier: row.ot_multiplier,
        updatedAt: row.updated_at ?? null,
      };
    }
  } catch {
    // keep defaults
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
      />
      <PtoRolloverCard />
      <PtoMonthlyCashoutCard />
    </div>
  );
}

