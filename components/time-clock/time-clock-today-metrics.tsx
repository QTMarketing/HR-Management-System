import type { TimeClockTodayMetrics } from "@/lib/time-clock/types";

/** KPI strip above the punch table — extend metrics in `computeTodayMetrics` (`lib/time-clock/enrich-punches.ts`). */

type Props = {
  metrics: TimeClockTodayMetrics;
};

export function TimeClockTodayMetricsStrip({ metrics }: Props) {
  const items: { label: string; value: number; valueClass: string }[] = [
    { label: "Scheduled", value: metrics.scheduledToday, valueClass: "text-slate-900" },
    { label: "Late clock-ins", value: metrics.lateClockIns, valueClass: "text-red-600" },
    { label: "Clocked in now", value: metrics.clockedInNow, valueClass: "text-emerald-600" },
    { label: "Total attendance", value: metrics.totalAttendance, valueClass: "text-slate-900" },
    { label: "Running Late", value: metrics.runningLate, valueClass: "text-amber-600" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
        >
          <p className={`text-2xl font-semibold tabular-nums ${item.valueClass}`}>{item.value}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
