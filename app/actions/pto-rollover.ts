"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RunPtoRolloverResult =
  | {
      ok: true;
      summary: {
        year: number;
        effective_at: string;
        grants_inserted: number;
        forfeits_inserted: number;
      };
    }
  | { ok: false; error: string };

export async function runPtoYearRollover(year: number): Promise<RunPtoRolloverResult> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: "Invalid year." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("pto_run_year_rollover", { p_year: year });
  if (error) return { ok: false, error: error.message };

  const row = data as Partial<{
    year: unknown;
    effective_at: unknown;
    grants_inserted: unknown;
    forfeits_inserted: unknown;
  }>;

  const n = (v: unknown, fallback: number) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const m = Number(v);
      if (Number.isFinite(m)) return m;
    }
    return fallback;
  };

  const y = n(row.year, year);
  const grants = n(row.grants_inserted, 0);
  const forfeits = n(row.forfeits_inserted, 0);
  const effectiveAt =
    typeof row.effective_at === "string" && row.effective_at.trim() ? row.effective_at : "";

  return {
    ok: true,
    summary: {
      year: y,
      effective_at: effectiveAt,
      grants_inserted: grants,
      forfeits_inserted: forfeits,
    },
  };
}

