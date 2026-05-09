"use client";

export type AttendanceFooterTab = "scheduled" | "present" | "on_leave";

type Props = {
  percent: number;
  scopeLabel: string;
  hasMetrics: boolean;
  scheduled: number;
  present: number;
  onLeave: number;
  /** Trend pill rendered next to Present in footer (e.g. "+2.4%"). */
  presentTrendText?: string | null;
  /**
   * Click on the gauge / status area opens the attendance hub on the default
   * tab (Scheduled). Disabled when `hasMetrics` is false.
   */
  onClick?: () => void;
  /**
   * Click on a footer cell (Scheduled / Present / On Leave) opens the hub on
   * that specific tab. Disabled when `hasMetrics` is false.
   */
  onFooterClick?: (tab: AttendanceFooterTab) => void;
};

const BAND_HEALTHY_MIN = 75;
const BAND_WATCH_MIN = 60;

type Band = "healthy" | "watch" | "low";

function getBand(pct: number): Band {
  if (pct >= BAND_HEALTHY_MIN) return "healthy";
  if (pct >= BAND_WATCH_MIN) return "watch";
  return "low";
}

const BAND_THEME: Record<
  Band,
  {
    numberText: string;
    subtitleText: string;
    statusLabel: string;
    statusPill: string;
  }
> = {
  healthy: {
    numberText: "text-emerald-700",
    subtitleText: "text-emerald-700/80",
    statusLabel: "Healthy",
    statusPill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  },
  watch: {
    numberText: "text-amber-700",
    subtitleText: "text-amber-700/80",
    statusLabel: "Watch",
    statusPill: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
  },
  low: {
    numberText: "text-rose-700",
    subtitleText: "text-rose-600/80",
    statusLabel: "Below target",
    statusPill: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
  },
};

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function TotalAttendanceChart({
  percent,
  scopeLabel,
  hasMetrics,
  scheduled,
  present,
  onLeave,
  presentTrendText = null,
  onClick,
  onFooterClick,
}: Props) {
  const pct = clampPct(percent);
  const display = hasMetrics
    ? `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`
    : "—";
  const band = getBand(pct);
  const theme = BAND_THEME[band];

  // Continuous half-circle tube gauge.
  const cx = 120;
  const cy = 110;
  const r = 90;
  const stroke = 18;
  const arcLen = Math.PI * r;
  const progress = hasMetrics ? pct / 100 : 0;
  const dashFilled = Math.max(0, Math.min(arcLen, arcLen * progress));
  const dashGap = Math.max(0, arcLen - dashFilled);
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const gaugeClickable = !!onClick && hasMetrics;
  const footerClickable = !!onFooterClick && hasMetrics;

  const cardBase =
    "flex h-full min-h-0 w-full min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";
  const gaugeInteractive =
    "block w-full rounded-xl text-left transition-all hover:-translate-y-0.5 hover:shadow-sm hover:ring-2 hover:ring-orange-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 active:translate-y-0";

  const ariaLabel = hasMetrics
    ? `Total attendance ${Number.isInteger(pct) ? pct : pct.toFixed(1)} percent — ${theme.statusLabel}. Open today's attendance breakdown.`
    : "Total attendance, no data yet";

  const gaugeArea = (
    <div className="relative flex min-h-0 flex-1 items-center justify-center pt-2">
      <div className="relative w-full max-w-[380px]">
        <svg
          viewBox="0 0 240 140"
          className="block h-auto w-full"
          role="img"
          aria-label={
            hasMetrics
              ? `Total attendance ${
                  Number.isInteger(pct) ? pct : pct.toFixed(1)
                } percent`
              : "Total attendance, no data"
          }
        >
          <defs>
            {/* Diagonal sweeps for that 3D lift. */}
            <linearGradient id="attendanceFillHealthy" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
            <linearGradient id="attendanceFillWatch" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="attendanceFillLow" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#fda4af" />
              <stop offset="100%" stopColor="#be123c" />
            </linearGradient>
          </defs>

          <path
            d={arcPath}
            fill="none"
            stroke="rgb(241,245,249)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />

          {/* Three foreground arcs share the same dash window; opacity
              crossfades between bands so the color change is buttery. */}
          <path
            d={arcPath}
            fill="none"
            stroke="url(#attendanceFillHealthy)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dashFilled} ${dashGap}`}
            opacity={hasMetrics && band === "healthy" ? 1 : 0}
            className="transition-opacity duration-500"
          />
          <path
            d={arcPath}
            fill="none"
            stroke="url(#attendanceFillWatch)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dashFilled} ${dashGap}`}
            opacity={hasMetrics && band === "watch" ? 1 : 0}
            className="transition-opacity duration-500"
          />
          <path
            d={arcPath}
            fill="none"
            stroke="url(#attendanceFillLow)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dashFilled} ${dashGap}`}
            opacity={hasMetrics && band === "low" ? 1 : 0}
            className="transition-opacity duration-500"
          />
        </svg>

        <div className="pointer-events-none absolute inset-x-0 bottom-[4%] text-center">
          <div
            className={`text-5xl font-extrabold tabular-nums tracking-tight transition-colors duration-500 ${
              hasMetrics ? theme.numberText : "text-slate-900"
            }`}
          >
            {display}
          </div>

          {hasMetrics ? (
            <div
              className={`mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-colors duration-500 ${theme.statusPill}`}
              aria-live="polite"
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
                  band === "healthy"
                    ? "bg-emerald-500"
                    : band === "watch"
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
                aria-hidden
              />
              {theme.statusLabel}
            </div>
          ) : null}

          <div
            className={`mt-1 text-xs font-semibold transition-colors duration-500 ${
              hasMetrics ? theme.subtitleText : "text-slate-500"
            }`}
          >
            {hasMetrics ? "On-time attendance rate" : "No attendance data yet"}
          </div>
        </div>
      </div>
    </div>
  );

  const footerCellBase =
    "px-1.5 py-2 text-center transition-colors rounded-lg";
  const footerCellInteractive =
    "cursor-pointer hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50";

  function FooterCell({
    label,
    value,
    tab,
    decoration,
  }: {
    label: string;
    value: string;
    tab: AttendanceFooterTab;
    decoration?: React.ReactNode;
  }) {
    const ariaLabelCell = `${label}: ${value}. Open ${label.toLowerCase()} list.`;
    const inner = (
      <>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {value}
          </div>
          {decoration}
        </div>
      </>
    );
    if (footerClickable) {
      return (
        <button
          type="button"
          onClick={() => onFooterClick?.(tab)}
          aria-label={ariaLabelCell}
          className={`${footerCellBase} ${footerCellInteractive}`}
        >
          {inner}
        </button>
      );
    }
    return <div className={footerCellBase}>{inner}</div>;
  }

  return (
    <div className={cardBase}>
      <div className="shrink-0">
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">
          Total attendance
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">{scopeLabel}</p>
      </div>

      {gaugeClickable ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel}
          className={`${gaugeInteractive} flex flex-1 flex-col`}
        >
          {gaugeArea}
        </button>
      ) : (
        <div className="flex flex-1 flex-col">{gaugeArea}</div>
      )}

      <div className="mt-5 shrink-0 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <FooterCell
            label="Scheduled"
            value={hasMetrics ? String(scheduled) : "—"}
            tab="scheduled"
          />
          <FooterCell
            label="Present"
            value={hasMetrics ? String(present) : "—"}
            tab="present"
            decoration={
              hasMetrics && !!presentTrendText?.trim() ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                  <span aria-hidden>↑</span> {presentTrendText.trim()}
                </span>
              ) : null
            }
          />
          <FooterCell
            label="On Leave"
            value={hasMetrics ? String(onLeave) : "—"}
            tab="on_leave"
          />
        </div>
      </div>
    </div>
  );
}
