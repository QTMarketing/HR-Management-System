type Props = {
  percent: number;
  scopeLabel: string;
  hasMetrics: boolean;
  scheduled: number;
  present: number;
  onLeave: number;
  /** Trend pill rendered next to Present in footer (e.g. "+2.4%"). */
  presentTrendText?: string | null;
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
}: Props) {
  const pct = clampPct(percent);
  const display = hasMetrics
    ? `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`
    : "—";

  // Continuous half-circle tube gauge.
  // viewBox is intentionally tall to give the percentage text a generous hollow.
  const cx = 120;
  const cy = 110;
  const r = 90;
  const stroke = 18;
  const arcLen = Math.PI * r;
  const progress = hasMetrics ? pct / 100 : 0;
  const dashFilled = Math.max(0, Math.min(arcLen, arcLen * progress));
  const dashGap = Math.max(0, arcLen - dashFilled);

  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="shrink-0">
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">Total attendance</h3>
        <p className="mt-0.5 text-xs text-slate-500">{scopeLabel}</p>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center pt-2">
        <div className="relative w-full max-w-[380px]">
          <svg
            viewBox="0 0 240 140"
            className="block h-auto w-full"
            role="img"
            aria-label={
              hasMetrics
                ? `Total attendance ${Number.isInteger(pct) ? pct : pct.toFixed(1)} percent`
                : "Total attendance, no data"
            }
          >
            <defs>
              <linearGradient id="attendanceFill" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>

            <path
              d={arcPath}
              fill="none"
              stroke="rgb(241,245,249)"
              strokeWidth={stroke}
              strokeLinecap="round"
            />
            <path
              d={arcPath}
              fill="none"
              stroke="url(#attendanceFill)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dashFilled} ${dashGap}`}
            />
          </svg>

          <div className="pointer-events-none absolute inset-x-0 bottom-[24%] text-center">
            <div className="text-5xl font-extrabold tabular-nums tracking-tight text-slate-900">
              {display}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {hasMetrics ? "On-time attendance rate" : "No attendance data yet"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 shrink-0 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="px-1.5 text-center">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Scheduled
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {hasMetrics ? String(scheduled) : "—"}
            </div>
          </div>
          <div className="px-1.5 text-center">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Present
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {hasMetrics ? String(present) : "—"}
              </div>
              {hasMetrics && !!presentTrendText?.trim() ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                  <span aria-hidden>↑</span> {presentTrendText.trim()}
                </span>
              ) : null}
            </div>
          </div>
          <div className="px-1.5 text-center">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              On Leave
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {hasMetrics ? String(onLeave) : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
