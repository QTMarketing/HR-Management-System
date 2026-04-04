/**
 * Phase 2: break rows attached to a work punch — paid vs unpaid rollup.
 */

export type TimeEntryBreakRow = {
  id: string;
  time_entry_id: string;
  started_at: string;
  ended_at: string | null;
  is_paid: boolean;
};

export type BreakRollup = {
  paidMinutes: number;
  unpaidMinutes: number;
  /** Any break row still open (ended_at null). */
  hasOpenBreak: boolean;
};

function intervalMinutes(startIso: string, endIso: string): number {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 60000);
}

/**
 * Sums paid/unpaid break minutes. Open breaks contribute elapsed time from `started_at` to `asOf`
 * (clamp inside the work span when `spanEndIso` is set — e.g. clock-out).
 */
export function rollupBreakMinutes(
  breaks: TimeEntryBreakRow[],
  asOf: Date,
  spanEndIso?: string | null,
): BreakRollup {
  const endCap = spanEndIso ? Date.parse(spanEndIso) : asOf.getTime();
  const cap = Number.isNaN(endCap) ? asOf.getTime() : Math.min(endCap, asOf.getTime());
  let paidMinutes = 0;
  let unpaidMinutes = 0;
  let hasOpenBreak = false;

  for (const br of breaks) {
    const start = Date.parse(br.started_at);
    if (Number.isNaN(start)) continue;

    if (br.ended_at) {
      const m = intervalMinutes(br.started_at, br.ended_at);
      if (br.is_paid) paidMinutes += m;
      else unpaidMinutes += m;
      continue;
    }

    hasOpenBreak = true;
    const openEnd = Math.min(cap, asOf.getTime());
    if (openEnd <= start) continue;
    const m = Math.round((openEnd - start) / 60000);
    if (br.is_paid) paidMinutes += m;
    else unpaidMinutes += m;
  }

  return { paidMinutes, unpaidMinutes, hasOpenBreak };
}

export function formatBreaksSummaryLabel(rollup: BreakRollup): string | null {
  const parts: string[] = [];
  if (rollup.unpaidMinutes > 0) {
    parts.push(`${rollup.unpaidMinutes}m unpaid`);
  }
  if (rollup.paidMinutes > 0) {
    parts.push(`${rollup.paidMinutes}m paid break`);
  }
  if (rollup.hasOpenBreak && parts.length === 0) {
    return "On break";
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}
