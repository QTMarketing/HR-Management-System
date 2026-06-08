"use client";

import {
  BarChart3,
  CalendarDays,
  ClockAlert,
  PartyPopper,
  TimerOff,
  UserCheck,
  Users,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { getDashboardDrillDown } from "@/app/actions/dashboard-drill-down";
import type {
  DashboardDrillKind,
  DashboardDrillRow,
} from "@/lib/dashboard/drill-down-types";
import { Sheet } from "@/components/ui/sheet";
import { TotalAttendanceChart } from "@/components/dashboard/total-attendance-chart";
import {
  AttendanceHubSheet,
  type AttendanceHubTabId,
} from "@/components/dashboard/attendance-hub-sheet";
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
  presentTrendText?: string | null;
  scopeLabel: string;
  hasMetrics: boolean;
  locationId: string;
  scopeAll: boolean;
  useDemoFallback: boolean;
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) {
    return `${p[0]![0] ?? ""}${p[p.length - 1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

const SHEET_COPY: Record<
  DashboardDrillKind,
  { title: string; description: string; empty: string; celebrate?: boolean }
> = {
  total_employees: {
    title: "Team roster",
    description: "Active employees in this scope.",
    empty: "No active employees found for this view.",
  },
  scheduled_today: {
    title: "Scheduled today",
    description: "People with at least one shift starting today.",
    empty: "No shifts on the calendar for today.",
  },
  clocked_in_now: {
    title: "Clocked in now",
    description: "Anyone with an open time log on the clock.",
    empty: "No one is clocked in right now.",
  },
  late_clock_ins: {
    title: "Late clock-ins",
    description:
      "First punch today is more than 30 minutes after their scheduled shift start.",
    empty: "Great job! Everyone is on time today.",
    celebrate: true,
  },
  late_clock_outs: {
    title: "Late clock-outs",
    description: "Still clocked in 30+ minutes after shift end, or clocked out late.",
    empty: "Great job! No late clock-outs today.",
    celebrate: true,
  },
  avg_weekly_hours: {
    title: "Average weekly hours",
    description: "Per-employee averages roll up from time logs.",
    empty: "Open Employee records for a downloadable breakdown by employee.",
  },
};

function KpiTile({
  label,
  value,
  sub,
  variant,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  value: string;
  sub?: string;
  variant: DashboardKpiVariant;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  const pal = dashboardKpiVariants[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-all sm:p-5 ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:ring-2 hover:ring-orange-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 active:translate-y-0"
      }`}
    >
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
    </button>
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
  locationId,
  scopeAll,
  useDemoFallback,
}: DashboardKpiStripProps) {
  const scheduled = Math.max(0, Math.floor(scheduledToday));
  const present = Math.max(0, Math.floor(clockedInNow));
  const onLeave = Math.max(0, scheduled - present);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [kind, setKind] = useState<DashboardDrillKind | null>(null);
  const [rows, setRows] = useState<DashboardDrillRow[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [hubOpen, setHubOpen] = useState(false);
  const [hubInitialTab, setHubInitialTab] =
    useState<AttendanceHubTabId>("scheduled");

  const copy = kind ? SHEET_COPY[kind] : null;

  function openHub(tab: AttendanceHubTabId) {
    if (!hasMetrics) return;
    setHubInitialTab(tab);
    setHubOpen(true);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q),
    );
  }, [rows, query]);

  function openKind(next: DashboardDrillKind) {
    setKind(next);
    setQuery("");
    setFetchError(null);
    setSheetOpen(true);
    if (next === "avg_weekly_hours") {
      setRows([]);
      return;
    }
    startTransition(async () => {
      const res = await getDashboardDrillDown({
        kind: next,
        locationId,
        scopeAll,
        useDemoFallback,
        scopeLabel,
      });
      if (!res.ok) {
        setRows([]);
        setFetchError(res.error);
        return;
      }
      setRows(res.rows);
    });
  }

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
            onClick={() => void openKind("total_employees")}
            disabled={false}
          />
          <KpiTile
            variant="amber"
            icon={CalendarDays}
            label="Scheduled today"
            value={hasMetrics ? String(scheduledToday) : "—"}
            sub="Shifts planned"
            onClick={() => void openKind("scheduled_today")}
            disabled={false}
          />
          <KpiTile
            variant="orange"
            icon={UserCheck}
            label="Clocked in now"
            value={hasMetrics ? String(clockedInNow) : "—"}
            sub="On the clock"
            onClick={() => openHub("present")}
            disabled={!hasMetrics}
          />
          <KpiTile
            variant="rose"
            icon={ClockAlert}
            label="Late clock-ins"
            value={hasMetrics ? String(lateClockIns) : "—"}
            sub="Today"
            onClick={() => openHub("scheduled")}
            disabled={!hasMetrics}
          />
          <KpiTile
            variant="sky"
            icon={TimerOff}
            label="Late clock-outs"
            value={hasMetrics ? String(lateClockOuts) : "—"}
            sub="End of shift"
            onClick={() => void openKind("late_clock_outs")}
            disabled={false}
          />
          <KpiTile
            variant="violet"
            icon={BarChart3}
            label="Avg weekly hours"
            value={hasMetrics ? avgWeeklyHours.toFixed(1) : "—"}
            sub="Per employee"
            onClick={() => void openKind("avg_weekly_hours")}
            disabled={false}
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
            onClick={hasMetrics ? () => openHub("scheduled") : undefined}
            onFooterClick={hasMetrics ? (tab) => openHub(tab) : undefined}
          />
        </div>
      </div>

      {/* Sheet block follows. */}
      {sheetOpen && copy && kind ? (
        <Sheet
          open={sheetOpen}
          onOpenChange={(o) => {
            setSheetOpen(o);
            if (!o) {
              setKind(null);
              setRows([]);
              setQuery("");
            }
          }}
          title={copy.title}
          description={copy.description}
        >
          {kind === "avg_weekly_hours" ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-10 text-center">
              <BarChart3 className="h-10 w-10 text-violet-500" aria-hidden />
              <p className="text-sm font-medium text-slate-800">{copy.empty}</p>
              <Link
                href="/reports/employee-records"
                className="text-sm font-semibold text-orange-600 underline-offset-2 hover:underline"
              >
                Open employee records →
              </Link>
            </div>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this list…"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-400/25"
                  aria-label="Filter list by name or store"
                />
              </div>

              {fetchError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {fetchError}
                </p>
              ) : null}

              {pending ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
              ) : filtered.length === 0 ? (
                <div
                  className={`flex flex-col items-center gap-3 rounded-xl border px-4 py-12 text-center ${
                    copy.celebrate
                      ? "border-emerald-200 bg-gradient-to-b from-emerald-50 to-white"
                      : "border-slate-100 bg-slate-50/80"
                  }`}
                >
                  {copy.celebrate ? (
                    <PartyPopper className="h-12 w-12 text-emerald-600" aria-hidden />
                  ) : (
                    <UserCheck className="h-10 w-10 text-slate-400" aria-hidden />
                  )}
                  <p className="max-w-xs text-sm font-medium text-slate-800">{copy.empty}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((r) => {
                    const isDemo = r.id.startsWith("demo-");
                    const inner = (
                      <>
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700"
                          aria-hidden
                        >
                          {initials(r.fullName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">{r.fullName}</p>
                          <p className="truncate text-xs text-slate-500">{r.subtitle}</p>
                        </div>
                      </>
                    );
                    return (
                      <li key={`${kind}-${r.id}`}>
                        {isDemo ? (
                          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
                            {inner}
                          </div>
                        ) : (
                          <Link
                            href={`/users/${r.id}`}
                            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40"
                            onClick={() => setSheetOpen(false)}
                          >
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </Sheet>
      ) : null}

      <AttendanceHubSheet
        open={hubOpen}
        onOpenChange={setHubOpen}
        locationId={locationId}
        scopeAll={scopeAll}
        useDemoFallback={useDemoFallback}
        scopeLabel={scopeLabel}
        initialTab={hubInitialTab}
      />
    </section>
  );
}
