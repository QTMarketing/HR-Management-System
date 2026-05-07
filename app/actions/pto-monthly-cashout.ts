"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RunPtoMonthlyCashoutResult =
  | {
      ok: true;
      summary: {
        year: number;
        month: number;
        effective_at: string;
        payouts_inserted: number;
        hours_paid_out: number;
      };
    }
  | { ok: false; error: string };

function n(val: unknown, fallback: number): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const m = Number(val);
    if (Number.isFinite(m)) return m;
  }
  return fallback;
}

export async function runPtoMonthlyVacationCashout(
  year: number,
  month: number,
): Promise<RunPtoMonthlyCashoutResult> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: "Invalid year." };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: "Invalid month." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("pto_run_monthly_vacation_cashout", {
    p_year: year,
    p_month: month,
  });
  if (error) return { ok: false, error: error.message };

  const row = data as Partial<{
    ok: unknown;
    error: unknown;
    year: unknown;
    month: unknown;
    effective_at: unknown;
    payouts_inserted: unknown;
    hours_paid_out: unknown;
  }>;

  if (row.ok === false) {
    const msg = typeof row.error === "string" && row.error.trim() ? row.error : "Cash-out failed.";
    return { ok: false, error: msg };
  }

  return {
    ok: true,
    summary: {
      year: n(row.year, year),
      month: n(row.month, month),
      effective_at:
        typeof row.effective_at === "string" && row.effective_at.trim() ? row.effective_at : "",
      payouts_inserted: n(row.payouts_inserted, 0),
      hours_paid_out: n(row.hours_paid_out, 0),
    },
  };
}

