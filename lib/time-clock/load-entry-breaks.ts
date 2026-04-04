import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimeEntryBreakRow } from "@/lib/time-clock/breaks";

/** Chunked `.in()` for large punch pools. */
export async function loadBreaksByEntryIds(
  supabase: SupabaseClient,
  entryIds: string[],
): Promise<Map<string, TimeEntryBreakRow[]>> {
  const map = new Map<string, TimeEntryBreakRow[]>();
  if (entryIds.length === 0) return map;

  const CHUNK = 400;
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    const slice = entryIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("time_entry_breaks")
      .select("id, time_entry_id, started_at, ended_at, is_paid")
      .in("time_entry_id", slice);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      const r = row as TimeEntryBreakRow;
      const list = map.get(r.time_entry_id) ?? [];
      list.push(r);
      map.set(r.time_entry_id, list);
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.started_at.localeCompare(b.started_at));
  }

  return map;
}
