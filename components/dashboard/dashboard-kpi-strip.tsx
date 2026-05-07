import {
  BarChart3,
  CalendarDays,
  ClockAlert,
  TimerOff,
  UserCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TotalAttendanceChart } from "@/components/dashboard/total-attendance-chart";
import {
  type DashboardKpiVariant,
  dashboardKpiVariants,
} from "@/lib/ui/dashboard-palette";

export type DashboardKpiStripProps = {
  totalEmployees: number;
  scheduledToday: number;
  clockedInNow: number;
  lateClockIns: number;
  lateClockOuts: number;
  avgWeeklyHours: number;
  totalAttendancePct: number;
  /** Trend hint for "Present" (e.g. "+2.4% vs yesterday"). */
  presentTrendText?: string | null;
  /** Shown under Total employees (e.g. location or "All locations") */
  scopeLabel: string;
  hasMetrics: boolean;
};

function KpiTile({
  label,
  value,
  sub,
  variant,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  variant: DashboardKpiVariant;
  icon: LucideIcon;
}) {
  const pal = dashboardKpiVariants[variant];
  return (
    <div className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:translate-y-0 sm:p-5">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full ${pal.iconCircle} shadow-sm`}
        aria-hidden
      >
        <Icon className="h-4 w-4 text-white" strokeWidth={2.25} />
      </div>
      <p className="mt-3 text-[11px] font-semibold leading-snug text-slate-600" title={label}>
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums leading-none tracking-tight text-slate-900">
        {value}
      </p>
      {sub ? (
        <p className="mt-2 text-[11px] leading-snug text-slate-500" title={sub}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export function DashboardKpiStrip({
  totalEmployees,
  scheduledToday,
  clockedInNow,
  lateClockIns,
  lateClockOuts,
  avgWeeklyHours,
  totalAttendancePct,
  presentTrendText,
  scopeLabel,
  hasMetrics,
}: DashboardKpiStripProps) {
  const scheduled = Math.max(0, Math.floor(scheduledToday));
  const present = Math.max(0, Math.floor(clockedInNow));
  const onLeave = Math.max(0, scheduled - present);
  return (
    <section aria-label="Dashboard metrics">
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
        <div className="grid min-h-0 min-w-0 grid-cols-2 gap-1.5 sm:gap-2 lg:col-span-2 lg:grid-cols-3">
          <KpiTile
            variant="emerald"
            icon={Users}
            label="Total employees"
            value={hasMetrics ? String(totalEmployees) : "—"}
            sub={scopeLabel}
          />
          <KpiTile
            variant="amber"
            icon={CalendarDays}
            label="Scheduled today"
            value={hasMetrics ? String(scheduledToday) : "—"}
            sub="Shifts planned"
          />
          <KpiTile
            variant="orange"
            icon={UserCheck}
            label="Clocked in now"
            value={hasMetrics ? String(clockedInNow) : "—"}
            sub="On the clock"
          />
          <KpiTile
            variant="rose"
            icon={ClockAlert}
            label="Late clock-ins"
            value={hasMetrics ? String(lateClockIns) : "—"}
            sub="Today"
          />
          <KpiTile
            variant="sky"
            icon={TimerOff}
            label="Late clock-outs"
            value={hasMetrics ? String(lateClockOuts) : "—"}
            sub="End of shift"
          />
          <KpiTile
            variant="violet"
            icon={BarChart3}
            label="Avg weekly hours"
            value={hasMetrics ? avgWeeklyHours.toFixed(1) : "—"}
            sub="Per employee"
          />
        </div>
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <TotalAttendanceChart
            percent={totalAttendancePct}
            scopeLabel={scopeLabel}
            hasMetrics={hasMetrics}
            scheduled={scheduled}
            present={present}
            onLeave={onLeave}
            presentTrendText={presentTrendText ?? null}
          />
        </div>
      </div>
    </section>
  );
}
