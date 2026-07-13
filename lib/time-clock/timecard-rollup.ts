import { dailyTotalLabel } from "@/lib/time-clock/punch-display";
import type { EnrichedPunchRow } from "@/lib/time-clock/types";
import { startOfWeek, type TimesheetPeriodKind } from "@/lib/time-clock/timesheet-period";

/** Local calendar day key `YYYY-MM-DD` for rollups (same clock-in day). */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday-start week; returns that Monday at local midnight (for grouping labels). */
export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function weekRangeLabel(fromMonday: Date, toSunday: Date): string {
  const a = fromMonday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const b = toSunday.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${a} – ${b}`;
}

/** Compact range label for arbitrary (non-week-aligned) date ranges, e.g. "Jul 1 – Jul 7". */
export function shortDateRangeLabel(from: Date, toInclusive: Date): string {
  const a = from.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const b = toInclusive.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return a === b ? a : `${a} – ${b}`;
}

/** Minutes worked for one punch when closed. */
export function punchMinutes(row: EnrichedPunchRow): number | null {
  // Prefer enriched minutes (net of unpaid breaks when attached).
  if (row.workedMinutes != null) return row.workedMinutes;
  return dailyTotalLabel(row.clockInAt, row.clockOutAt).minutes;
}

export function formatHoursMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** LaMa-style signed variance (actual − scheduled), e.g. `-00:19`, `00:00`. */
export function formatSignedVarianceMinutes(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m === 0) return "00:00";
  const neg = m < 0;
  const abs = Math.abs(Math.round(m));
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  const body = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}

/** Per-day sums for daily-total column in employee timecard. */
export function dailyMinutesMap(rows: EnrichedPunchRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = localDayKey(r.clockInAt);
    if (!key) continue;
    const mins = punchMinutes(r);
    if (mins == null) continue;
    m.set(key, (m.get(key) ?? 0) + mins);
  }
  return m;
}

// ── Period week-band grouping (timecard modal) ────────────────────────────────

/** One week band inside the timecard table (e.g. "Week 1 · Jul 1 – Jul 7"). */
export type TimecardPeriodBlock = {
  /** Stable React key (week start day key). */
  key: string;
  /** First day of the band (clamped to the pay period when known). */
  rangeStart: Date;
  /** Last day of the band, inclusive (clamped to the pay period when known). */
  rangeEndInclusive: Date;
  /** "Week 1" / "Week 2" for bi-weekly periods; null otherwise. */
  weekIndexLabel: string | null;
  rows: EnrichedPunchRow[];
};

type TimecardPeriodContext = {
  periodKind?: TimesheetPeriodKind | null;
  periodStartIso?: string | null;
  periodEndExclusiveIso?: string | null;
  /** 0=Sunday … 6=Saturday. */
  weekStartsOn?: number;
};

function parseIsoOrNull(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Group timecard rows into week bands within the current pay period.
 * Bi-weekly periods get "Week 1" / "Week 2" labels; band ranges are clamped
 * to the period bounds so labels never show days outside the pay period.
 */
export function groupRowsIntoTimecardBlocks(
  rows: EnrichedPunchRow[],
  context: TimecardPeriodContext,
  sortDir: "asc" | "desc" = "asc",
): TimecardPeriodBlock[] {
  const weekStartsOn =
    typeof context.weekStartsOn === "number" &&
    Number.isInteger(context.weekStartsOn) &&
    context.weekStartsOn >= 0 &&
    context.weekStartsOn <= 6
      ? context.weekStartsOn
      : 1;

  const periodStart = parseIsoOrNull(context.periodStartIso);
  const periodEndExclusive = parseIsoOrNull(context.periodEndExclusiveIso);
  const periodEndInclusive = periodEndExclusive
    ? new Date(periodEndExclusive.getTime() - 86_400_000)
    : null;

  const byWeekStart = new Map<number, EnrichedPunchRow[]>();
  for (const r of rows) {
    const d = new Date(r.clockInAt);
    if (Number.isNaN(d.getTime())) continue;
    const ws = startOfWeek(d, weekStartsOn).getTime();
    const bucket = byWeekStart.get(ws);
    if (bucket) {
      bucket.push(r);
    } else {
      byWeekStart.set(ws, [r]);
    }
  }

  const ascStarts = [...byWeekStart.keys()].sort((a, b) => a - b);

  // Week index labels only make sense when the period spans fixed weeks (bi-weekly).
  const labelWeeks = context.periodKind === "bi_weekly" && periodStart != null;
  const periodFirstWeekMs = labelWeeks
    ? startOfWeek(periodStart, weekStartsOn).getTime()
    : null;

  const blocks: TimecardPeriodBlock[] = ascStarts.map((ws) => {
    const weekStart = new Date(ws);
    const weekEndInclusive = new Date(ws);
    weekEndInclusive.setDate(weekEndInclusive.getDate() + 6);

    let rangeStart = weekStart;
    if (periodStart && periodStart > rangeStart) rangeStart = periodStart;
    let rangeEndInclusive = weekEndInclusive;
    if (periodEndInclusive && periodEndInclusive < rangeEndInclusive) {
      rangeEndInclusive = periodEndInclusive;
    }

    let weekIndexLabel: string | null = null;
    if (labelWeeks && periodFirstWeekMs != null) {
      const weekIndex = Math.round((ws - periodFirstWeekMs) / (7 * 86_400_000));
      weekIndexLabel = `Week ${weekIndex + 1}`;
    }

    const blockRows = (byWeekStart.get(ws) ?? []).slice().sort((a, b) => {
      const diff = new Date(a.clockInAt).getTime() - new Date(b.clockInAt).getTime();
      return sortDir === "asc" ? diff : -diff;
    });

    return {
      key: localDayKey(weekStart.toISOString()) || String(ws),
      rangeStart,
      rangeEndInclusive,
      weekIndexLabel,
      rows: blockRows,
    };
  });

  return sortDir === "asc" ? blocks : blocks.reverse();
}
