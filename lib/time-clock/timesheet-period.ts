/**
 * Timesheet / pay-period windows per clock (weekly, monthly, semi-monthly, custom split).
 * Boundaries use the viewer's local timezone when computed on the client; server uses the same
 * calendar-day logic with JS Date in UTC for query bounds (see `periodBoundsToQueryIso`).
 */

export type TimesheetPeriodKind = "weekly" | "monthly" | "semi_monthly" | "custom";

/** Stored in `time_clocks.timesheet_period_config`. */
export type TimesheetPeriodConfig = {
  /**
   * Last day of the "first half" of the month (1-based). Second half is split_after_day+1 … last day.
   * Default 15. Valid range 1–27 for semi_monthly and custom.
   */
  split_after_day?: number;
};

export const DEFAULT_PERIOD_KIND: TimesheetPeriodKind = "weekly";

export function normalizePeriodConfig(
  raw: unknown,
  kind: TimesheetPeriodKind,
): TimesheetPeriodConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const split = o.split_after_day;
  const splitNum =
    typeof split === "number" && Number.isInteger(split) && split >= 1 && split <= 27
      ? split
      : undefined;
  if (kind === "semi_monthly" || kind === "custom") {
    return { split_after_day: splitNum ?? 15 };
  }
  return splitNum != null ? { split_after_day: splitNum } : {};
}

function splitDay(config: TimesheetPeriodConfig, kind: TimesheetPeriodKind): number {
  if (kind !== "semi_monthly" && kind !== "custom") return 15;
  const d = config.split_after_day;
  if (typeof d === "number" && d >= 1 && d <= 27) return d;
  return 15;
}

function startOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday 00:00 local of the ISO week containing `d`. */
export function startOfWeekMonday(d: Date): Date {
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + mondayOffset);
  m.setHours(0, 0, 0, 0);
  return m;
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export type PeriodBounds = {
  /** Inclusive start (midnight local). */
  start: Date;
  /** Exclusive end (midnight local of day after last day in range). */
  endExclusive: Date;
};

/**
 * Period containing `anchor` (any instant) for the given kind.
 */
export function getPeriodBounds(
  anchor: Date,
  kind: TimesheetPeriodKind,
  config: TimesheetPeriodConfig,
): PeriodBounds {
  const split = splitDay(config, kind);

  if (kind === "weekly") {
    const start = startOfWeekMonday(anchor);
    const endExclusive = new Date(start);
    endExclusive.setDate(endExclusive.getDate() + 7);
    return { start, endExclusive };
  }

  if (kind === "monthly") {
    const start = startOfMonth(anchor);
    const endExclusive = addMonths(start, 1);
    return { start, endExclusive };
  }

  // semi_monthly + custom: two segments per month
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const day = anchor.getDate();

  if (day <= split) {
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const endExclusive = new Date(y, m, split + 1, 0, 0, 0, 0);
    return { start, endExclusive };
  }

  const start = new Date(y, m, split + 1, 0, 0, 0, 0);
  const endExclusive = addMonths(new Date(y, m, 1), 1);
  return { start, endExclusive };
}

/** Canonical period start (first instant of the period) for navigation labels. */
export function getPeriodStart(anchor: Date, kind: TimesheetPeriodKind, config: TimesheetPeriodConfig): Date {
  return getPeriodBounds(anchor, kind, config).start;
}

/**
 * Move to previous/next period's start (for prev/next chevrons).
 */
export function shiftPeriodAnchor(
  currentStart: Date,
  kind: TimesheetPeriodKind,
  config: TimesheetPeriodConfig,
  direction: -1 | 1,
): Date {
  const split = splitDay(config, kind);

  if (kind === "weekly") {
    const d = new Date(currentStart);
    d.setDate(d.getDate() + direction * 7);
    return d;
  }

  if (kind === "monthly") {
    return addMonths(currentStart, direction);
  }

  // semi / custom: alternate between 1st and (split+1) within / across months
  const y = currentStart.getFullYear();
  const m = currentStart.getMonth();
  const cd = currentStart.getDate();

  if (direction === 1) {
    if (cd === 1) {
      // first half → second half same month
      return new Date(y, m, split + 1, 0, 0, 0, 0);
    }
    // second half → first half next month
    return new Date(y, m + 1, 1, 0, 0, 0, 0);
  }

  // direction -1
  if (cd === 1) {
    // at first of month → go to second half of *previous* month
    const prevMonth = addMonths(new Date(y, m, 1), -1);
    const py = prevMonth.getFullYear();
    const pm = prevMonth.getMonth();
    return new Date(py, pm, split + 1, 0, 0, 0, 0);
  }
  // at split+1 → first half same month
  return new Date(y, m, 1, 0, 0, 0, 0);
}

/** List each calendar day in [start, endExclusive). */
export function enumerateDaysInPeriod(bounds: PeriodBounds): Date[] {
  const out: Date[] = [];
  const cur = startOfDayLocal(bounds.start);
  const end = bounds.endExclusive.getTime();
  while (cur.getTime() < end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Format range label like 01/04 – 30/04 (DD/MM). */
export function formatPeriodRangeLabel(bounds: PeriodBounds): string {
  const lastInclusive = new Date(bounds.endExclusive);
  lastInclusive.setDate(lastInclusive.getDate() - 1);
  const dd = (n: number) => String(n).padStart(2, "0");
  const a = bounds.start;
  const b = lastInclusive;
  return `${dd(a.getDate())}/${dd(a.getMonth() + 1)} – ${dd(b.getDate())}/${dd(b.getMonth() + 1)}`;
}

/** ISO strings for Supabase `clock_in_at` filter: [start, endExclusive). */
export function periodBoundsToQueryIso(bounds: PeriodBounds): { gte: string; lt: string } {
  return {
    gte: bounds.start.toISOString(),
    lt: bounds.endExclusive.toISOString(),
  };
}

export function parsePeriodKind(raw: string | undefined | null): TimesheetPeriodKind | null {
  if (!raw) return null;
  if (raw === "weekly" || raw === "monthly" || raw === "semi_monthly" || raw === "custom") {
    return raw;
  }
  return null;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build period bounds from URL `range_from` / `range_to` (YYYY-MM-DD, local calendar dates).
 * `dateTo` is inclusive (last day shown); storage uses exclusive end at midnight after last day.
 */
export function periodBoundsFromDateStrings(dateFrom: string, dateTo: string): PeriodBounds | null {
  if (!YMD_RE.test(dateFrom) || !YMD_RE.test(dateTo)) return null;
  const [y1, m1, d1] = dateFrom.split("-").map(Number);
  const [y2, m2, d2] = dateTo.split("-").map(Number);
  const start = new Date(y1, m1 - 1, d1, 0, 0, 0, 0);
  const lastInclusive = new Date(y2, m2 - 1, d2, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(lastInclusive.getTime())) return null;
  if (lastInclusive < start) return null;
  const endExclusive = new Date(lastInclusive);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { start, endExclusive };
}

/** Shift a custom day range by the same length (prev/next). */
export function shiftCustomRangeYmd(
  fromYmd: string,
  toYmd: string,
  direction: -1 | 1,
): { from: string; to: string } | null {
  const b = periodBoundsFromDateStrings(fromYmd, toYmd);
  if (!b) return null;
  const nDays = Math.round((b.endExclusive.getTime() - b.start.getTime()) / 86400000);
  const newStart = new Date(b.start);
  newStart.setDate(newStart.getDate() + direction * nDays);
  const newEndEx = new Date(b.endExclusive);
  newEndEx.setDate(newEndEx.getDate() + direction * nDays);
  const lastIn = new Date(newEndEx);
  lastIn.setDate(lastIn.getDate() - 1);
  const y = newStart.getFullYear();
  const m = String(newStart.getMonth() + 1).padStart(2, "0");
  const d = String(newStart.getDate()).padStart(2, "0");
  const y2 = lastIn.getFullYear();
  const m2 = String(lastIn.getMonth() + 1).padStart(2, "0");
  const d2 = String(lastIn.getDate()).padStart(2, "0");
  return { from: `${y}-${m}-${d}`, to: `${y2}-${m2}-${d2}` };
}
