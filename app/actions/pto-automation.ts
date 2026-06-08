"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  finishPtoAutomationRun,
  insertPtoAutomationRun,
  loadPtoAutomationSettings,
  localPolicyDateParts,
  runMonthlyCashoutViaAdmin,
  runYearRolloverViaAdmin,
  type PtoAutomationRunRow,
  type PtoAutomationSettings,
} from "@/lib/pto/automation-run";

export type PtoAutomationPageData = {
  settings: PtoAutomationSettings | null;
  recentRuns: PtoAutomationRunRow[];
};

export async function loadPtoAutomationPageData(): Promise<PtoAutomationPageData> {
  const supabase = await createSupabaseServerClient();
  const settings = await loadPtoAutomationSettings();

  const { data: runs } = await supabase
    .from("pto_automation_runs")
    .select(
      "id, job_type, period_key, status, triggered_by, summary, error_message, started_at, finished_at",
    )
    .order("started_at", { ascending: false })
    .limit(15);

  return {
    settings,
    recentRuns: (runs ?? []) as PtoAutomationRunRow[],
  };
}

export type UpdatePtoAutomationSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updatePtoAutomationSettings(input: {
  yearRolloverAutoEnabled: boolean;
  monthlyCashoutAutoEnabled: boolean;
}): Promise<UpdatePtoAutomationSettingsResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (ctx.enabled && !hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return { ok: false, error: "Only Organization Owners can change automation settings." };
  }

  const { data: pol } = await supabase
    .from("pto_policies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pol?.id) return { ok: false, error: "No PTO policy row found." };

  const { error } = await supabase
    .from("pto_policies")
    .update({
      year_rollover_auto_enabled: input.yearRolloverAutoEnabled,
      monthly_cashout_auto_enabled: input.monthlyCashoutAutoEnabled,
    })
    .eq("id", pol.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pto-admin");
  return { ok: true };
}

export type RunPtoAutomationNowResult =
  | { ok: true; results: Array<{ job: string; status: string; detail?: string }> }
  | { ok: false; error: string };

/** Owner action: run whatever jobs are due today (same logic as cron). */
export async function runPtoAutomationNow(): Promise<RunPtoAutomationNowResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (ctx.enabled && !hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return { ok: false, error: "Only Organization Owners can run automation." };
  }

  const results = await executeDuePtoAutomationJobs("scheduled");
  revalidatePath("/pto-admin");
  return { ok: true, results };
}

/** Shared by cron route and manual "run due jobs" button. */
export async function executeDuePtoAutomationJobs(
  triggeredBy: "cron" | "scheduled",
): Promise<Array<{ job: string; status: string; detail?: string }>> {
  const settings = await loadPtoAutomationSettings();
  if (!settings) {
    return [{ job: "config", status: "failed", detail: "PTO policy or service role missing." }];
  }

  const { year, month, day } = localPolicyDateParts(settings.timezone);
  const results: Array<{ job: string; status: string; detail?: string }> = [];

  if (settings.yearRolloverAutoEnabled && month === 1 && day === 1) {
    const periodKey = String(year);
    const runId = await insertPtoAutomationRun({
      jobType: "year_rollover",
      periodKey,
      triggeredBy,
    });
    const r = await runYearRolloverViaAdmin(year);
    if (runId) {
      await finishPtoAutomationRun({
        runId,
        status: r.ok ? "success" : "failed",
        summary: r.ok ? r.summary : {},
        errorMessage: r.ok ? null : r.error,
      });
    }
    results.push({
      job: "year_rollover",
      status: r.ok ? "success" : "failed",
      detail: r.ok
        ? `${r.summary.grants_inserted ?? 0} grants, ${r.summary.forfeits_inserted ?? 0} forfeits`
        : r.error,
    });
  } else if (settings.yearRolloverAutoEnabled) {
    results.push({
      job: "year_rollover",
      status: "skipped",
      detail: "Not Jan 1 in policy timezone.",
    });
  }

  const cashoutDue =
    settings.monthlyCashoutAutoEnabled &&
    settings.vacationCashoutEnabled &&
    day === settings.vacationCashoutDay;

  if (cashoutDue) {
    const periodKey = `${year}-${String(month).padStart(2, "0")}`;
    const runId = await insertPtoAutomationRun({
      jobType: "monthly_cashout",
      periodKey,
      triggeredBy,
    });
    const r = await runMonthlyCashoutViaAdmin(year, month);
    if (runId) {
      await finishPtoAutomationRun({
        runId,
        status: r.ok ? "success" : "failed",
        summary: r.ok ? r.summary : {},
        errorMessage: r.ok ? null : r.error,
      });
    }
    results.push({
      job: "monthly_cashout",
      status: r.ok ? "success" : "failed",
      detail: r.ok
        ? `${r.summary.payouts_inserted ?? 0} payouts`
        : r.error,
    });
  } else if (settings.monthlyCashoutAutoEnabled) {
    results.push({
      job: "monthly_cashout",
      status: "skipped",
      detail: `Not cash-out day (${settings.vacationCashoutDay}) or cash-out disabled.`,
    });
  }

  if (results.length === 0) {
    results.push({ job: "none", status: "skipped", detail: "Automation toggles off." });
  }

  return results;
}

/** Log a manual rollover/cashout from existing Owner buttons. */
export async function logManualPtoAutomationRun(input: {
  jobType: "year_rollover" | "monthly_cashout";
  periodKey: string;
  status: "success" | "failed";
  summary: Record<string, unknown>;
  errorMessage?: string | null;
}): Promise<void> {
  const runId = await insertPtoAutomationRun({
    jobType: input.jobType,
    periodKey: input.periodKey,
    triggeredBy: "manual",
  });
  if (!runId) return;
  await finishPtoAutomationRun({
    runId,
    status: input.status,
    summary: input.summary,
    errorMessage: input.errorMessage ?? null,
  });
  revalidatePath("/pto-admin");
}
