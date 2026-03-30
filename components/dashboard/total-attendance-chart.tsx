const CX = 50;
const CY = 50;
const OUTER_R = 40;
/** Number of equal pie sections around the circle */
const SLICE_COUNT = 12;
/** Extra turn so the wedge pattern sits how we want (45° clockwise from default top start). */
const PIE_ROTATION_RAD = Math.PI / 4;

type Props = {
  percent: number;
  scopeLabel: string;
  hasMetrics: boolean;
};

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function wedgePath(sliceIndex: number, total: number): string {
  const base = -Math.PI / 2 + PIE_ROTATION_RAD;
  const a0 = base + (sliceIndex * 2 * Math.PI) / total;
  const a1 = base + ((sliceIndex + 1) * 2 * Math.PI) / total;
  const x0 = CX + OUTER_R * Math.cos(a0);
  const y0 = CY + OUTER_R * Math.sin(a0);
  const x1 = CX + OUTER_R * Math.cos(a1);
  const y1 = CY + OUTER_R * Math.sin(a1);
  return `M ${CX} ${CY} L ${x0} ${y0} A ${OUTER_R} ${OUTER_R} 0 0 1 ${x1} ${y1} Z`;
}

/** Stronger on first filled slice, softer toward the end of the filled run */
function filledSliceOpacity(indexInFilledRun: number, filledCount: number): number {
  if (filledCount <= 0) return 0;
  if (filledCount === 1) return 1;
  const t = indexInFilledRun / (filledCount - 1);
  return 1 - t * 0.35;
}

export function TotalAttendanceChart({ percent, scopeLabel, hasMetrics }: Props) {
  const pct = clampPct(percent);
  const display = hasMetrics
    ? `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`
    : "—";
  const filledCount = hasMetrics
    ? Math.min(SLICE_COUNT, Math.round((pct / 100) * SLICE_COUNT))
    : 0;

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 px-4 py-2.5 shadow-md shadow-orange-600/30 sm:px-5 sm:py-3">
      <div className="relative z-10 flex shrink-0 items-center gap-2">
        <span
          className="relative flex h-2 w-2 shrink-0"
          title="Active — live metrics"
          aria-hidden
        >
          <span className="absolute inline-flex h-full w-full rounded-full bg-lime-300 opacity-70 motion-safe:animate-ping motion-reduce:opacity-0" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lime-300 shadow-[0_0_14px_rgba(190,242,100,1),0_0_6px_rgba(253,224,71,0.9)]" />
        </span>
        <h3 className="text-sm font-bold tracking-tight text-white">
          Total attendance
        </h3>
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 items-center gap-4 pt-2 sm:gap-5 sm:pt-2.5">
        <div className="relative aspect-square w-full max-w-[170px] shrink-0 sm:max-w-[180px]">
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full"
            role="img"
            aria-label={
              hasMetrics
                ? `Total attendance ${Number.isInteger(pct) ? pct : pct.toFixed(1)} percent`
                : "Total attendance, no data"
            }
          >
            {Array.from({ length: SLICE_COUNT }, (_, i) => {
              const isFilled = i < filledCount;
              const opacity = isFilled
                ? filledSliceOpacity(i, filledCount)
                : 0.22;
              return (
                <path
                  key={i}
                  d={wedgePath(i, SLICE_COUNT)}
                  fill="rgb(255,255,255)"
                  fillOpacity={opacity}
                  stroke="rgba(255,255,255,0.38)"
                  strokeWidth={0.65}
                  strokeLinejoin="miter"
                />
              );
            })}
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 pl-0.5 pr-3 sm:pl-1 sm:pr-5">
          <p className="whitespace-nowrap text-4xl font-bold leading-none tracking-tight text-white tabular-nums drop-shadow-sm sm:text-5xl lg:text-4xl xl:text-5xl 2xl:text-6xl">
            {display}
          </p>
          <p className="max-w-full text-pretty text-sm font-medium leading-snug text-white/80 sm:text-base lg:text-lg">
            {scopeLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
