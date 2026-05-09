"use client";

import {
  CalendarDays,
  CalendarOff,
  Clock,
  Search,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { getAttendanceHub } from "@/app/actions/attendance-hub";
import { Sheet } from "@/components/ui/sheet";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type {
  AttendanceHubLeaveRow,
  AttendanceHubPresentRow,
  AttendanceHubResult,
  AttendanceHubScheduledRow,
} from "@/lib/dashboard/attendance-hub-types";

export type AttendanceHubTabId = "scheduled" | "present" | "on_leave";

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  locationId: string;
  scopeAll: boolean;
  useDemoFallback: boolean;
  scopeLabel: string;
  /** Tab to focus when the sheet opens. Resets every time it transitions to open. */
  initialTab?: AttendanceHubTabId;
};

type TabId = AttendanceHubTabId;

const LATE_GRACE_MS = 30 * 60 * 1000;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function AttendanceHubSheet({
  open,
  onOpenChange,
  locationId,
  scopeAll,
  useDemoFallback,
  scopeLabel,
  initialTab = "scheduled",
}: Props) {
  const [tab, setTab] = useState<TabId>(initialTab);

  // Sync the selected tab with `initialTab` each time the sheet opens. We don't
  // change tabs while the sheet is already open — that would yank focus mid-task.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const [query, setQuery] = useState("");
  const [data, setData] = useState<{
    scheduled: AttendanceHubScheduledRow[];
    present: AttendanceHubPresentRow[];
    onLeave: AttendanceHubLeaveRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Live ticker drives Present durations and Scheduled "late" labels. Only
  // ticks while the sheet is open so we don't keep re-rendering the dashboard.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  // Reset transient state on open / close. Only refetch on open.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res: AttendanceHubResult = await getAttendanceHub({
        locationId,
        scopeAll,
        useDemoFallback,
        scopeLabel,
      });
      if (!res.ok) {
        setData({ scheduled: [], present: [], onLeave: [] });
        setError(res.error);
        return;
      }
      setData({
        scheduled: res.scheduled,
        present: res.present,
        onLeave: res.onLeave,
      });
    });
  }, [open, locationId, scopeAll, useDemoFallback, scopeLabel, startTransition]);

  const counts = {
    scheduled: data?.scheduled.length ?? 0,
    present: data?.present.length ?? 0,
    onLeave: data?.onLeave.length ?? 0,
  };

  const tabs: TabItem[] = [
    {
      value: "scheduled",
      label: "Scheduled",
      count: counts.scheduled,
    },
    {
      value: "present",
      label: "Present",
      count: counts.present,
      decoration:
        counts.present > 0 ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        ) : undefined,
    },
    {
      value: "on_leave",
      label: "On Leave",
      count: counts.onLeave,
    },
  ];

  const q = query.trim().toLowerCase();

  const filteredScheduled = useMemo(() => {
    if (!data) return [];
    if (!q) return data.scheduled;
    return data.scheduled.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.storeName.toLowerCase().includes(q),
    );
  }, [data, q]);
  const filteredPresent = useMemo(() => {
    if (!data) return [];
    if (!q) return data.present;
    return data.present.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.storeName.toLowerCase().includes(q),
    );
  }, [data, q]);
  const filteredLeave = useMemo(() => {
    if (!data) return [];
    if (!q) return data.onLeave;
    return data.onLeave.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.storeName.toLowerCase().includes(q) ||
        r.leaveType.toLowerCase().includes(q),
    );
  }, [data, q]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Attendance hub today"
      description={`${scopeLabel} · ${new Date(nowMs).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })}`}
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this list…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-400/25"
            aria-label="Filter the active tab by name or detail"
          />
        </div>

        <Tabs
          tabs={tabs}
          value={tab}
          onValueChange={(v) => setTab(v as TabId)}
          panelId="attendance-hub-panel"
          ariaLabel="Attendance views"
        />

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div
          id="attendance-hub-panel"
          role="tabpanel"
          aria-busy={pending && !data ? true : undefined}
        >
          {pending && !data ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
          ) : tab === "scheduled" ? (
            <ScheduledList rows={filteredScheduled} nowMs={nowMs} onNavigate={() => onOpenChange(false)} />
          ) : tab === "present" ? (
            <PresentList rows={filteredPresent} nowMs={nowMs} onNavigate={() => onOpenChange(false)} />
          ) : (
            <LeaveList rows={filteredLeave} onNavigate={() => onOpenChange(false)} />
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Row({
  id,
  fullName,
  primary,
  secondary,
  trailing,
  onNavigate,
}: {
  id: string;
  fullName: string;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  trailing?: React.ReactNode;
  onNavigate: () => void;
}) {
  const isDemo = id.startsWith("demo-");
  const inner = (
    <>
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700"
        aria-hidden
      >
        {initials(fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{primary}</p>
        <p className="truncate text-xs text-slate-500">{secondary}</p>
      </div>
      {trailing ? <div className="shrink-0 pl-2 text-right">{trailing}</div> : null}
    </>
  );
  const className =
    "flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm";
  if (isDemo) {
    return <div className={className}>{inner}</div>;
  }
  return (
    <Link
      href={`/users/${id}`}
      onClick={onNavigate}
      className={`${className} transition hover:border-orange-200 hover:bg-orange-50/40`}
    >
      {inner}
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-12 text-center">
      <Icon className="h-10 w-10 text-slate-400" aria-hidden />
      <p className="max-w-xs text-sm font-medium text-slate-800">{title}</p>
    </div>
  );
}

function ScheduledList({
  rows,
  nowMs,
  onNavigate,
}: {
  rows: AttendanceHubScheduledRow[];
  nowMs: number;
  onNavigate: () => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No shifts scheduled today — nothing to track."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const startMs = new Date(r.shiftStartIso).getTime();
        const isLate =
          r.clockInAtIso === null && nowMs > startMs + LATE_GRACE_MS;
        const minsLate = isLate
          ? Math.max(0, Math.round((nowMs - startMs) / 60000))
          : 0;
        const trailing = isLate ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-bold text-rose-600">
              {minsLate} min late
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {fmtTime(r.shiftStartIso)}
            </span>
          </div>
        ) : (
          <span className="text-xs font-semibold tabular-nums text-slate-700">
            {fmtTime(r.shiftStartIso)}
          </span>
        );
        const detail = r.clockInAtIso
          ? `${r.storeName} · Clocked in ${fmtTime(r.clockInAtIso)}`
          : isLate
            ? `${r.storeName} · Hasn't clocked in`
            : `${r.storeName} · Starts soon`;
        return (
          <li key={`sch-${r.id}`}>
            <Row
              id={r.id}
              fullName={r.fullName}
              primary={r.fullName}
              secondary={detail}
              trailing={trailing}
              onNavigate={onNavigate}
            />
          </li>
        );
      })}
    </ul>
  );
}

function PresentList({
  rows,
  nowMs,
  onNavigate,
}: {
  rows: AttendanceHubPresentRow[];
  nowMs: number;
  onNavigate: () => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={UserCheck}
        title="No one is on the clock right now."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const dur = fmtDuration(nowMs - new Date(r.clockInAtIso).getTime());
        return (
          <li key={`pres-${r.id}`}>
            <Row
              id={r.id}
              fullName={r.fullName}
              primary={r.fullName}
              secondary={`${r.storeName} · Since ${fmtTime(r.clockInAtIso)}`}
              trailing={
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                  <Clock className="h-3 w-3" aria-hidden />
                  Worked {dur}
                </span>
              }
              onNavigate={onNavigate}
            />
          </li>
        );
      })}
    </ul>
  );
}

function LeaveList({
  rows,
  onNavigate,
}: {
  rows: AttendanceHubLeaveRow[];
  onNavigate: () => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarOff}
        title="Everyone is present and accounted for!"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const detail = r.allDay
          ? `${r.storeName} · All day`
          : `${r.storeName} · ${fmtTime(r.startAtIso)} – ${fmtTime(r.endAtIso)}`;
        return (
          <li key={`leave-${r.id}`}>
            <Row
              id={r.id}
              fullName={r.fullName}
              primary={r.fullName}
              secondary={detail}
              trailing={
                <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-100">
                  {r.leaveType}
                </span>
              }
              onNavigate={onNavigate}
            />
          </li>
        );
      })}
    </ul>
  );
}
