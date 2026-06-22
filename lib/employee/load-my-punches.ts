import type { SupabaseClient } from "@supabase/supabase-js";

export type MyPunchRow = {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: string;
  jobCode: string | null;
  storeName: string | null;
};

export type LoadMyPunchesResult =
  | { ok: true; rows: MyPunchRow[]; rangeLabel: string }
  | { ok: false; error: string };

const SELECT =
  "id, clock_in_at, clock_out_at, status, job_code, locations(name)";

/** Last 14 days of punches for the signed-in employee (newest first). */
export async function loadMyPunches(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<LoadMyPunchesResult> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  start.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("time_entries")
    .select(SELECT)
    .eq("employee_id", employeeId)
    .is("archived_at", null)
    .gte("clock_in_at", start.toISOString())
    .order("clock_in_at", { ascending: false })
    .limit(60);

  if (error) return { ok: false, error: error.message };

  const rows: MyPunchRow[] = (data ?? []).map((r) => {
    const loc = r.locations as { name?: string } | { name?: string }[] | null;
    const storeName = Array.isArray(loc)
      ? loc[0]?.name ?? null
      : loc?.name ?? null;
    return {
      id: r.id as string,
      clockInAt: r.clock_in_at as string,
      clockOutAt: (r.clock_out_at as string | null) ?? null,
      status: String(r.status ?? ""),
      jobCode: (r.job_code as string | null) ?? null,
      storeName,
    };
  });

  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const rangeLabel = `${fmt(start)} – ${fmt(end)}`;

  return { ok: true, rows, rangeLabel };
}
