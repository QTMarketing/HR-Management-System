"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GetPtoBalancesResult =
  | {
      ok: true;
      vacationHours: number;
      sickHours: number;
      standardDayHours: number;
      vacationCashoutEnabled: boolean;
      nextVacationCashoutAt: string | null;
      nextVacationCashoutHours: number;
      lastVacationCashoutAt: string | null;
      lastVacationCashoutHours: number;
      ytdVacationUsedHours: number;
    }
  | { ok: false; error: string };

function toNumber(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function getPtoBalancesForEmployee(employeeId: string): Promise<GetPtoBalancesResult> {
  const id = employeeId?.trim();
  if (!id) return { ok: false, error: "Missing employee id." };

  const supabase = await createSupabaseServerClient();

  const { data: polRow, error: polErr } = await supabase
    .from("pto_policies")
    .select("standard_day_hours, timezone, vacation_cashout_enabled, vacation_cashout_day")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (polErr) return { ok: false, error: polErr.message };
  const standardDayHours = Math.max(
    1,
    toNumber((polRow as { standard_day_hours?: unknown } | null)?.standard_day_hours) ?? 8,
  );

  const vacationCashoutEnabled =
    Boolean((polRow as { vacation_cashout_enabled?: unknown } | null)?.vacation_cashout_enabled) ??
    false;
  const vacationCashoutDayRaw = toNumber(
    (polRow as { vacation_cashout_day?: unknown } | null)?.vacation_cashout_day,
  );
  const vacationCashoutDay =
    vacationCashoutDayRaw !== null ? Math.min(28, Math.max(1, vacationCashoutDayRaw)) : 1;

  const { data, error } = await supabase
    .from("pto_employee_balances")
    .select("bucket, balance_hours")
    .eq("employee_id", id)
    .in("bucket", ["vacation", "sick"]);

  if (error) return { ok: false, error: error.message };

  let vacationHours = 0;
  let sickHours = 0;

  for (const row of (data ?? []) as { bucket: string; balance_hours: unknown }[]) {
    const hrs = toNumber(row.balance_hours) ?? 0;
    if (row.bucket === "vacation") vacationHours = hrs;
    if (row.bucket === "sick") sickHours = hrs;
  }

  // Cash-out + YTD usage are optional UX hints for the timecard.
  const ytdStartIso = new Date(new Date().getFullYear(), 0, 1, 0, 0, 0).toISOString();

  const [{ data: lastPayoutRow, error: lastPayoutErr }, { data: ytdUsageRows, error: ytdUsageErr }] =
    await Promise.all([
      supabase
        .from("pto_ledger_entries")
        .select("amount_hours, effective_at, metadata")
        .eq("employee_id", id)
        .eq("bucket", "vacation")
        .eq("entry_type", "payout")
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("pto_ledger_entries")
        .select("amount_hours")
        .eq("employee_id", id)
        .eq("bucket", "vacation")
        .eq("entry_type", "usage")
        .gte("effective_at", ytdStartIso),
    ]);

  if (lastPayoutErr) return { ok: false, error: lastPayoutErr.message };
  if (ytdUsageErr) return { ok: false, error: ytdUsageErr.message };

  const lastAmountRaw = toNumber((lastPayoutRow as { amount_hours?: unknown } | null)?.amount_hours);
  const lastAtRaw =
    typeof (lastPayoutRow as { effective_at?: unknown } | null)?.effective_at === "string"
      ? String((lastPayoutRow as { effective_at?: string } | null)?.effective_at ?? "")
      : "";
  const lastVacationCashoutAt = lastAtRaw.trim() ? lastAtRaw : null;
  const lastVacationCashoutHours =
    lastAmountRaw !== null ? Math.max(0, -lastAmountRaw) : 0;

  let ytdVacationUsedHours = 0;
  for (const r of (ytdUsageRows ?? []) as { amount_hours: unknown }[]) {
    const a = toNumber(r.amount_hours) ?? 0;
    // usage entries are stored as negative hours (debit); display as positive.
    ytdVacationUsedHours += Math.max(0, -a);
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const today = now.getDate();
  const nextMonth = today <= vacationCashoutDay ? m : m + 1;
  const nextYear = nextMonth <= 12 ? y : y + 1;
  const nextMonthNorm = nextMonth <= 12 ? nextMonth : 1;
  const nextVacationCashoutAt = vacationCashoutEnabled
    ? new Date(nextYear, nextMonthNorm - 1, vacationCashoutDay, 0, 0, 0).toISOString()
    : null;

  return {
    ok: true,
    vacationHours,
    sickHours,
    standardDayHours,
    vacationCashoutEnabled,
    nextVacationCashoutAt,
    nextVacationCashoutHours: vacationCashoutEnabled ? vacationHours : 0,
    lastVacationCashoutAt,
    lastVacationCashoutHours,
    ytdVacationUsedHours,
  };
}

