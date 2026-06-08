import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PtoAutomationJobType = "year_rollover" | "monthly_cashout";
export type PtoAutomationTrigger = "manual" | "scheduled" | "cron";
export type PtoAutomationStatus = "running" | "success" | "failed" | "skipped";

export type PtoAutomationRunRow = {
  id: string;
  job_type: PtoAutomationJobType;
  period_key: string;
  status: PtoAutomationStatus;
  triggered_by: PtoAutomationTrigger;
  summary: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

export type PtoAutomationSettings = {
  yearRolloverAutoEnabled: boolean;
  monthlyCashoutAutoEnabled: boolean;
  vacationCashoutEnabled: boolean;
  vacationCashoutDay: number;
  timezone: string;
};

export async function insertPtoAutomationRun(input: {
  jobType: PtoAutomationJobType;
  periodKey: string;
  triggeredBy: PtoAutomationTrigger;
}): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("pto_automation_runs")
    .insert({
      job_type: input.jobType,
      period_key: input.periodKey,
      status: "running",
      triggered_by: input.triggeredBy,
      summary: {},
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}

export async function finishPtoAutomationRun(input: {
  runId: string;
  status: Exclude<PtoAutomationStatus, "running">;
  summary?: Record<string, unknown>;
  errorMessage?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;

  await admin
    .from("pto_automation_runs")
    .update({
      status: input.status,
      summary: input.summary ?? {},
      error_message: input.errorMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.runId);
}

/** Policy row fields needed to decide if cron should run today. */
export async function loadPtoAutomationSettings(): Promise<PtoAutomationSettings | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("pto_policies")
    .select(
      "year_rollover_auto_enabled, monthly_cashout_auto_enabled, vacation_cashout_enabled, vacation_cashout_day, timezone",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    yearRolloverAutoEnabled: Boolean(data.year_rollover_auto_enabled),
    monthlyCashoutAutoEnabled: Boolean(data.monthly_cashout_auto_enabled),
    vacationCashoutEnabled: Boolean(data.vacation_cashout_enabled),
    vacationCashoutDay: Number(data.vacation_cashout_day ?? 1),
    timezone: (data.timezone as string | null)?.trim() || "UTC",
  };
}

/** Local calendar parts in the policy timezone (for cron scheduling). */
export function localPolicyDateParts(timezone: string, at = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = fmt.formatToParts(at);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? at.getUTCFullYear());
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1);
  return { year, month, day };
}

export async function runYearRolloverViaAdmin(
  year: number,
): Promise<{ ok: true; summary: Record<string, unknown> } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Service role not configured." };

  const { data, error } = await admin.rpc("pto_run_year_rollover", { p_year: year });
  if (error) return { ok: false, error: error.message };

  return { ok: true, summary: (data as Record<string, unknown>) ?? {} };
}

export async function runMonthlyCashoutViaAdmin(
  year: number,
  month: number,
): Promise<{ ok: true; summary: Record<string, unknown> } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Service role not configured." };

  const { data, error } = await admin.rpc("pto_run_monthly_vacation_cashout", {
    p_year: year,
    p_month: month,
  });
  if (error) return { ok: false, error: error.message };

  const row = data as { ok?: boolean; error?: string } & Record<string, unknown>;
  if (row.ok === false) {
    return { ok: false, error: row.error ?? "Cash-out failed." };
  }

  return { ok: true, summary: row };
}
