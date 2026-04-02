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
    <div className="rounded-lg border border-slate-200 bg-white pl-4 pr-5 pb-2.5 pt-3 shadow-sm sm:pl-5 sm:pr-7 sm:pb-2.5 sm:pt-3.5">
      <div className="flex items-start gap-3 sm:gap-3.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${pal.iconCircle} shadow-sm sm:h-9 sm:w-9`}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5 text-white sm:h-4 sm:w-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1 pt-1 text-right sm:pt-1.5">
          <p
            className="text-pretty text-[10px] font-medium leading-snug text-slate-600 sm:text-[11px]"
            title={label}
          >
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums leading-none tracking-tight text-slate-900 sm:mt-1.5 sm:text-[1.75rem] md:text-3xl">
            {value}
          </p>
          {sub ? (
            <p
              className="mt-1 text-pretty text-[10px] leading-snug text-slate-500 sm:mt-1.5"
              title={sub}
            >
              {sub}
            </p>
          ) : null}
        </div>
      </div>
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
  scopeLabel,
  hasMetrics,
}: DashboardKpiStripProps) {
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
          />
        </div>
      </div>
    </section>
  );
}
