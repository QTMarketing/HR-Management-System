"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  autoAssignJobsForWeek,
  deleteUnavailability,
  deleteShift,
  publishDraftShiftsForWeek,
  seedDemoShiftsForWeek,
} from "@/app/actions/schedule";
import { DayPicker } from "react-day-picker";
import { formatWeekQueryParam, mondayOfWeekContaining } from "@/lib/schedule/week";
import {
  AddShiftModal,
  type ScheduleEmployeeOption,
  type ScheduleLocationOption,
} from "@/components/schedule/add-shift-modal";
import { AddUnavailabilityModal } from "@/components/schedule/add-unavailability-modal";
import {
  buildDayColumns,
  draftPublishCount,
  filterShiftsQuery,
  formatHoursClock,
  jobRowsForSection,
  type ShiftForBoard,
  sectionTotals,
  shiftsForCell,
  shiftsForUserCell,
  uniqueGroupSections,
  weekTotals,
} from "@/lib/schedule/board-model";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  MinusCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sun,
  Trash2,
  Users,
} from "lucide-react";

function formatSpan(isoStart: string, isoEnd: string): string {
  try {
    const a = new Date(isoStart);
    const b = new Date(isoEnd);
    const t1 = a.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    const t2 = b.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${t1} – ${t2}`;
  } catch {
    return "—";
  }
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function hoursBetweenIso(isoStart: string, isoEnd: string): string {
  const a = new Date(isoStart).getTime();
  const b = new Date(isoEnd).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return "0:00";
  const totalMin = Math.round((b - a) / 60000);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type CellHoverActionsProps = {
  menuKey: string;
  openMenuKey: string | null;
  setOpenMenuKey: (k: string | null) => void;
  onQuickAdd: () => void;
  onTimeOff: () => void;
  onUnavailability: () => void;
  unavailabilityLabel?: string;
};

function ScheduleCellHoverActions({
  menuKey,
  openMenuKey,
  setOpenMenuKey,
  onQuickAdd,
  onTimeOff,
  onUnavailability,
  unavailabilityLabel = "Add unavailability",
}: CellHoverActionsProps) {
  const open = openMenuKey === menuKey;
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenMenuKey(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuKey(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpenMenuKey]);

  return (
    <div
      ref={rootRef}
      data-schedule-cell-menu-root
      className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100"
    >
      <div className="flex items-center gap-0.5 rounded-full border border-slate-200/90 bg-white/95 p-0.5 shadow-md ring-1 ring-slate-900/5 backdrop-blur-[2px]">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700"
          title="Add shift"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuKey(null);
            onQuickAdd();
          }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
        <div className="relative">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title="More options"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuKey(open ? null : menuKey);
            }}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
          {open ? (
            <div
              role="menu"
              className="absolute left-1/2 top-[calc(100%+8px)] z-40 min-w-[216px] -translate-x-1/2 rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-slate-800 hover:bg-slate-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuKey(null);
                  onTimeOff();
                }}
              >
                <Sun className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                Add time off
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-slate-800 hover:bg-slate-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuKey(null);
                  onUnavailability();
                }}
              >
                <MinusCircle className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                {unavailabilityLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toHmLocal(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function localMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addLocalDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

type Props = {
  weekMonday: Date;
  /** `YYYY-MM-DD` for the week’s Monday — sent to publish action. */
  weekParam: string;
  rangeLabel: string;
  prevWeekHref: string;
  nextWeekHref: string;
  todayWeekHref: string;
  viewRange: "day" | "week" | "month";
  selectedDate: Date;
  locationLabel: string;
  scopeAll: boolean;
  locationNamesById: Map<string, string>;
  shifts: ShiftForBoard[];
  publishDraftCount: number;
  canEditSchedule: boolean;
  employeesForPicker: ScheduleEmployeeOption[];
  locationsForPicker: ScheduleLocationOption[];
  jobsForPicker: { id: string; location_id: string; name: string }[];
  /** Resolved store when header is not “all locations”. */
  defaultLocationId: string | null;
  /** Open add modal once (e.g. from hub `?add=1`). */
  initialAddOpen?: boolean;
  /** Shifts in this week missing `job_id` (mock backfill helper). */
  missingJobCount: number;
  unavailability: {
    id: string;
    employee_id: string;
    location_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
  }[];
};

export function ScheduleWeekBoard({
  weekMonday,
  weekParam,
  rangeLabel,
  prevWeekHref,
  nextWeekHref,
  todayWeekHref,
  viewRange,
  selectedDate,
  locationLabel,
  scopeAll,
  locationNamesById,
  shifts: shiftsProp,
  publishDraftCount: publishFromServer,
  canEditSchedule,
  employeesForPicker,
  locationsForPicker,
  jobsForPicker,
  defaultLocationId,
  initialAddOpen = false,
  missingJobCount,
  unavailability,
}: Props) {
  const unavailByEmployeeDay = useMemo(() => {
    const map = new Map<
      string,
      { id: string; reason: string | null; start_at: string; end_at: string }[]
    >();
    for (const u of unavailability) {
      const start = new Date(u.start_at);
      const end = new Date(u.end_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      if (end <= start) continue;

      // Attach to each local day that the block overlaps (handles multi-day unavailability).
      const cursor = localMidnight(start);
      const last = localMidnight(end);
      for (let i = 0; i < 32; i++) {
        const dayStart = addLocalDays(cursor, i);
        const dayEnd = addLocalDays(dayStart, 1);
        if (dayStart > last && dayStart > end) break;
        const overlaps = start < dayEnd && end > dayStart;
        if (!overlaps) continue;
        const key = `${u.employee_id}:${toYmdLocal(dayStart)}`;
        const prev = map.get(key) ?? [];
        prev.push({
          id: u.id,
          reason: u.reason ?? null,
          start_at: u.start_at,
          end_at: u.end_at,
        });
        map.set(key, prev);
      }
    }
    for (const [k, items] of map.entries()) {
      items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
      map.set(k, items);
    }
    return map;
  }, [unavailability]);
  const router = useRouter();
  const [publishPending, startPublishTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [fixJobsPending, startFixJobsTransition] = useTransition();
  const [seedPending, startSeedTransition] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState<boolean>(initialAddOpen && canEditSchedule);
  const [unavailOpen, setUnavailOpen] = useState(false);
  const [modalNonce, setModalNonce] = useState(0);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [createSeed, setCreateSeed] = useState<
    | {
        locationId?: string;
        employeeIds?: string[];
        jobId?: string;
        start?: Date;
        end?: Date;
      }
    | null
  >(null);
  const [lastPickedDay, setLastPickedDay] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"job" | "users" | "list">(() => {
    if (typeof window === "undefined") return "users";
    const mode = new URLSearchParams(window.location.search).get("mode");
    return mode === "users" || mode === "job" || mode === "list" ? mode : "users";
  });
  const [showDailyInfo, setShowDailyInfo] = useState(true);
  const [showWeeklySummary, setShowWeeklySummary] = useState(true);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const rangeMenuRef = useRef<HTMLDivElement | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );
  const [cellMenuKey, setCellMenuKey] = useState<string | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!viewMenuRef.current?.contains(e.target as Node)) setViewMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewMenuOpen(false);
    }
    if (viewMenuOpen) {
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKey);
      };
    }
  }, [viewMenuOpen]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rangeMenuRef.current?.contains(e.target as Node)) setRangeMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRangeMenuOpen(false);
    }
    if (rangeMenuOpen) {
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKey);
      };
    }
  }, [rangeMenuOpen]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!calendarRef.current?.contains(e.target as Node)) setCalendarOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCalendarOpen(false);
    }
    if (calendarOpen) {
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKey);
      };
    }
  }, [calendarOpen]);

  const afterMutation = () => {
    router.replace(`/schedule/board?week=${encodeURIComponent(weekParam)}`);
    router.refresh();
  };
  const shifts = useMemo(() => filterShiftsQuery(shiftsProp, search), [shiftsProp, search]);

  const setModeInUrl = (mode: "users" | "job" | "list") => {
    const params = new URLSearchParams(window.location.search);
    params.set("mode", mode);
    router.push(`/schedule/board?${params.toString()}`);
  };
  const listRows = useMemo(() => {
    const rows = [...shifts];
    rows.sort((a, b) => {
      const t = new Date(a.shift_start).getTime() - new Date(b.shift_start).getTime();
      if (t !== 0) return t;
      return (a.jobName ?? "").localeCompare(b.jobName ?? "");
    });
    return rows;
  }, [shifts]);
  const { columns } = buildDayColumns(weekMonday, shifts);
  const displayedColumns = useMemo(() => {
    if (viewRange !== "day") return columns;
    const idx = Math.max(
      0,
      Math.min(
        6,
        Math.floor((new Date(selectedDate).getTime() - weekMonday.getTime()) / 86400000),
      ),
    );
    return [columns[idx]];
  }, [columns, viewRange, selectedDate, weekMonday]);
  const sections = uniqueGroupSections(shifts);
  const totals = weekTotals(shifts);
  const topJobs = useMemo(() => {
    const byJob = new Map<string, number>();
    for (const s of shifts) {
      const key = s.jobName ?? "No job";
      byJob.set(key, (byJob.get(key) ?? 0) + (new Date(s.shift_end).getTime() - new Date(s.shift_start).getTime()) / 3600000);
    }
    return [...byJob.entries()]
      .map(([job, hours]) => ({ job, hours: Math.round(hours * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours || a.job.localeCompare(b.job))
      .slice(0, 2);
  }, [shifts]);
  const publishCount = useMemo(() => draftPublishCount(shifts), [shifts]);
  const today = new Date();
  /** Prefer server count when search cleared so Publish matches full week */
  const publishN = search.trim() ? publishCount : publishFromServer;
  const editingShift = useMemo(
    () => shiftsProp.find((s) => s.id === editingShiftId) ?? null,
    [shiftsProp, editingShiftId],
  );

  const formatYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const navigateToViewRange = (next: "day" | "week" | "month") => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", next);
    if (next === "week") {
      const monday = mondayOfWeekContaining(selectedDate);
      params.set("week", formatWeekQueryParam(monday));
      params.delete("date");
    } else {
      params.set("date", formatYmd(selectedDate));
      params.delete("week");
    }
    router.push(`/schedule/board?${params.toString()}`);
    setRangeMenuOpen(false);
    setCalendarOpen(false);
  };

  const openCreateShift = (seed: {
    locationId?: string;
    employeeIds?: string[];
    jobId?: string;
    start?: Date;
    end?: Date;
  }) => {
    if (!canEditSchedule) return;
    setCellMenuKey(null);
    setRangeMenuOpen(false);
    if (seed.start) setLastPickedDay(new Date(seed.start));
    setEditingShiftId(null);
    setCreateSeed(seed);
    setModalNonce((n) => n + 1);
    setAddOpen(true);
  };

  const [unavailSeed, setUnavailSeed] = useState<{
    employeeId: string;
    employeeName: string;
    locationId: string;
    locationName: string;
    start: Date;
    end: Date;
  } | null>(null);

  const openUnavailability = (seed: {
    employeeId: string;
    employeeName: string;
    locationId: string;
    locationName: string;
    start: Date;
    end: Date;
  }) => {
    if (!canEditSchedule) return;
    setCellMenuKey(null);
    setRangeMenuOpen(false);
    setCalendarOpen(false);
    setUnavailSeed(seed);
    setModalNonce((n) => n + 1);
    setUnavailOpen(true);
  };

  const openUnavailabilityComingSoon = () => {
    window.alert("Pick an empty cell to add unavailability for a specific employee/date.");
  };
  const goTimeClockForTimeOff = () => {
    router.push("/time-clock");
  };

  /** Default day/time when opening the add-shift panel from an employee row (name column). */
  const defaultCreateWindowFromNameRow = () => {
    const dateForCell = displayedColumns[0]?.date ?? weekMonday;
    const start = new Date(dateForCell);
    start.setHours(9, 0, 0, 0);
    const end = new Date(dateForCell);
    end.setHours(17, 0, 0, 0);
    return { start, end };
  };

  const openSchedulePanelForEmployee = (emp: ScheduleEmployeeOption) => {
    if (!canEditSchedule) return;
    const { start, end } = defaultCreateWindowFromNameRow();
    openCreateShift({
      locationId: emp.location_id,
      employeeIds: [emp.id],
      start,
      end,
    });
  };

  return (
    <div className="min-h-0 space-y-3">
        {unavailSeed ? (
          <AddUnavailabilityModal
            key={`unavail-${modalNonce}`}
            open={unavailOpen}
            onClose={() => {
              setUnavailOpen(false);
              setUnavailSeed(null);
            }}
            employeeId={unavailSeed.employeeId}
            employeeName={unavailSeed.employeeName}
            locationId={unavailSeed.locationId}
            locationName={unavailSeed.locationName}
            start={unavailSeed.start}
            end={unavailSeed.end}
            onSuccess={() => router.refresh()}
          />
        ) : null}
        <AddShiftModal
          key={modalNonce}
          open={addOpen}
          onClose={() => {
            setAddOpen(false);
            setEditingShiftId(null);
            setCreateSeed(null);
          }}
          weekMonday={weekMonday}
          scopeAll={scopeAll}
          locations={locationsForPicker}
          defaultLocationId={defaultLocationId}
          employees={employeesForPicker}
          jobs={jobsForPicker}
          onSuccess={afterMutation}
          initialShift={editingShift}
          initialCreate={createSeed}
          contextUnavailability={unavailability}
          contextShifts={shiftsProp.map((s) => ({
            id: s.id,
            employee_id: s.employee_id,
            location_id: s.location_id,
            shift_start: s.shift_start,
            shift_end: s.shift_end,
            jobName: s.jobName,
            assignedEmployeeIds: s.assignedEmployeeIds,
            assignedEmployeeNames: s.assignedEmployeeNames,
            assignedLabel: s.assignedLabel,
          }))}
          modalKey={modalNonce}
        />

        {/* Toolbar — Connecteam-style */}
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/schedule" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              ← Schedule hub
            </Link>
            <span className="text-slate-300">|</span>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Schedule</h1>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
            >
              Main schedule
              <span className="text-slate-400">▾</span>
            </button>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              Permissions
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
              disabled
            >
              Requests
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
              disabled
            >
              Job list
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white p-2 text-slate-500"
              disabled
              aria-label="Settings"
            >
              ⚙
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={viewMenuRef}>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                aria-haspopup="menu"
                aria-expanded={viewMenuOpen}
                onClick={() => setViewMenuOpen((v) => !v)}
              >
                View options <span className="text-slate-400">▾</span>
              </button>
              {viewMenuOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+6px)] z-20 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      viewMode === "users" ? "bg-slate-100 text-slate-900" : "hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setViewMode("users");
                      setModeInUrl("users");
                      setViewMenuOpen(false);
                    }}
                  >
                    View by users
                    {viewMode === "users" ? <span className="text-xs text-slate-500">✓</span> : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      viewMode === "job" ? "bg-slate-100 text-slate-900" : "hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setViewMode("job");
                      setModeInUrl("job");
                      setViewMenuOpen(false);
                    }}
                  >
                    View by job
                    {viewMode === "job" ? <span className="text-xs text-slate-500">✓</span> : null}
                  </button>

                  <div className="my-2 border-t border-slate-100" />

                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setViewMode("list");
                      setModeInUrl("list");
                      setViewMenuOpen(false);
                    }}
                  >
                    List view
                    {viewMode === "list" ? (
                      <span className="text-xs text-slate-500">✓</span>
                    ) : (
                      <span className="text-xs text-slate-400">→</span>
                    )}
                  </button>

                  <div className="my-2 border-t border-slate-100" />

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={showDailyInfo}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => setShowDailyInfo((v) => !v)}
                  >
                    Daily info
                    <span className="text-xs text-slate-500">{showDailyInfo ? "On" : "Off"}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={showWeeklySummary}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => setShowWeeklySummary((v) => !v)}
                  >
                    Weekly summary
                    <span className="text-xs text-slate-500">{showWeeklySummary ? "On" : "Off"}</span>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500"
              aria-label="Filter"
            >
              <Filter className="h-4 w-4" />
            </button>
            <div className="relative" ref={rangeMenuRef}>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                aria-haspopup="menu"
                aria-expanded={rangeMenuOpen}
                onClick={() => setRangeMenuOpen((v) => !v)}
              >
                {viewRange === "day" ? "Day" : viewRange === "month" ? "Month" : "Week"}{" "}
                <span className="text-slate-400">▾</span>
              </button>
              {rangeMenuOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+6px)] z-20 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      viewRange === "day" ? "bg-slate-100 text-slate-900" : "hover:bg-slate-50"
                    }`}
                    onClick={() => navigateToViewRange("day")}
                  >
                    Day
                    {viewRange === "day" ? <span className="text-xs text-slate-500">✓</span> : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      viewRange === "week" ? "bg-slate-100 text-slate-900" : "hover:bg-slate-50"
                    }`}
                    onClick={() => navigateToViewRange("week")}
                  >
                    Week
                    {viewRange === "week" ? <span className="text-xs text-slate-500">✓</span> : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      viewRange === "month" ? "bg-slate-100 text-slate-900" : "hover:bg-slate-50"
                    }`}
                    onClick={() => navigateToViewRange("month")}
                  >
                    Month
                    {viewRange === "month" ? <span className="text-xs text-slate-500">✓</span> : null}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={prevWeekHref}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div className="relative" ref={calendarRef}>
              <button
                type="button"
                className="flex min-w-[160px] items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                onClick={() => {
                  setCalendarOpen((v) => {
                    const next = !v;
                    if (next) {
                      setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
                    }
                    return next;
                  });
                }}
                aria-haspopup="dialog"
                aria-expanded={calendarOpen}
              >
                <CalendarDays className="h-4 w-4 text-slate-500" />
                {rangeLabel}
              </button>
              {calendarOpen ? (
                <div className="absolute left-1/2 top-[calc(100%+10px)] z-30 w-[288px] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Calendar
                      </div>
                      <div className="text-[13px] font-semibold leading-4 text-slate-900">Jump to date</div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        const d = new Date();
                        const params = new URLSearchParams(window.location.search);
                        params.set("view", viewRange);
                        if (viewRange === "week") {
                          const monday = mondayOfWeekContaining(d);
                          params.set("week", formatWeekQueryParam(monday));
                          // Keep a stable anchor date so other UI (like toolbar Add) doesn't snap to "today".
                          params.set(
                            "date",
                            `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`,
                          );
                        } else {
                          params.set(
                            "date",
                            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                          );
                          params.delete("week");
                        }
                        router.push(`/schedule/board?${params.toString()}`);
                        setCalendarOpen(false);
                      }}
                    >
                      Today
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="sr-only">Month</span>
                      <select
                        className="h-7 w-full rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={calendarMonth.getMonth()}
                        onChange={(e) => {
                          const m = Number(e.target.value);
                          if (Number.isNaN(m)) return;
                          setCalendarMonth(new Date(calendarMonth.getFullYear(), m, 1));
                        }}
                      >
                        {Array.from({ length: 12 }, (_, i) => {
                          const label = new Date(2000, i, 1).toLocaleString(undefined, { month: "long" });
                          return (
                            <option key={i} value={i}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <label className="block">
                      <span className="sr-only">Year</span>
                      <select
                        className="h-7 w-full rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={calendarMonth.getFullYear()}
                        onChange={(e) => {
                          const y = Number(e.target.value);
                          if (Number.isNaN(y)) return;
                          setCalendarMonth(new Date(y, calendarMonth.getMonth(), 1));
                        }}
                      >
                        {Array.from({ length: 9 }, (_, i) => {
                          const y = today.getFullYear() - 4 + i;
                          return (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>

                  <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-1.5">
                    <DayPicker
                      mode="single"
                      selected={selectedDate}
                      showOutsideDays
                      month={calendarMonth}
                      onMonthChange={(d) => {
                        setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                      }}
                      className="w-full"
                      classNames={{
                        months: "w-full",
                        month: "w-full",
                        month_caption: "flex items-center justify-between px-1.5 py-1",
                        caption_label: "text-[12px] font-semibold text-slate-900",
                        nav: "flex items-center gap-1",
                        button_previous:
                          "h-6 w-6 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        button_next:
                          "h-6 w-6 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        month_grid: "w-full border-collapse",
                        weekdays: "grid grid-cols-7 px-1",
                        weekday:
                          "text-[9px] font-semibold uppercase tracking-wide text-slate-500 text-center py-0.5",
                        week: "grid grid-cols-7 px-1",
                        day: "py-0 text-center",
                        day_button:
                          "mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
                        today: "ring-1 ring-blue-200 bg-blue-50 text-blue-900",
                        selected: "bg-blue-600 text-white hover:bg-blue-600 hover:text-white",
                        outside: "text-slate-400 opacity-60",
                        disabled: "text-slate-400 opacity-40",
                      }}
                      onSelect={(d) => {
                        if (!d) return;
                        const params = new URLSearchParams(window.location.search);
                        params.set("view", viewRange);
                        if (viewRange === "week") {
                          const monday = mondayOfWeekContaining(d);
                          params.set("week", formatWeekQueryParam(monday));
                          params.set(
                            "date",
                            `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`,
                          );
                        } else {
                          params.set(
                            "date",
                            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                          );
                          params.delete("week");
                        }
                        router.push(`/schedule/board?${params.toString()}`);
                        setCalendarOpen(false);
                      }}
                    />
                  </div>

                  <p className="mt-1.5 text-[10px] text-slate-500">Tip: use month/year to jump.</p>
                </div>
              ) : null}
            </div>
            <Link
              href={nextWeekHref}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href={todayWeekHref}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Today
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              Actions <span className="text-slate-400">▾</span>
            </button>
            {missingJobCount > 0 && canEditSchedule ? (
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                disabled={fixJobsPending}
                title="Assign default jobs to shifts missing a job (demo helper)"
                onClick={() => {
                  startFixJobsTransition(async () => {
                    const r = await autoAssignJobsForWeek(weekParam);
                    if (!r.ok) {
                      window.alert(r.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
              >
                {fixJobsPending ? "Fixing…" : `Fix jobs (${missingJobCount})`}
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canEditSchedule}
              title={
                !canEditSchedule
                  ? "You don’t have permission to add shifts."
                  : "Add a shift for this week"
              }
              onClick={() => {
                if (!canEditSchedule) return;
                const base =
                  lastPickedDay ??
                  (viewRange === "week" ? new Date(weekMonday) : new Date(selectedDate));
                base.setHours(9, 0, 0, 0);
                const end = new Date(base);
                end.setHours(17, 0, 0, 0);
                openCreateShift({
                  locationId: (!scopeAll && defaultLocationId) || locationsForPicker[0]?.id,
                  start: base,
                  end,
                });
              }}
            >
              Add <span className="text-slate-400">▾</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              disabled={publishN === 0 || publishPending}
              title={publishN === 0 ? "No draft shifts to publish" : "Publish shifts to employees"}
              onClick={() => {
                if (publishN === 0) return;
                setPublishError(null);
                startPublishTransition(async () => {
                  const r = await publishDraftShiftsForWeek(weekParam);
                  if (!r.ok) {
                    setPublishError(r.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              {publishPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              Publish ({publishN})
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] text-slate-500">
            Scope: <span className="font-medium text-slate-700">{locationLabel}</span>
            {scopeAll ? " · All locations" : ""}
          </p>
          {publishError ? (
            <p className="text-[11px] font-medium text-red-600" role="alert">
              {publishError}
            </p>
          ) : null}
          {deleteError ? (
            <p className="text-[11px] font-medium text-red-600" role="alert">
              {deleteError}
            </p>
          ) : null}
        </div>

        <div>
        {viewMode === "list" ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
              <div className="text-xs font-semibold text-slate-700">List view</div>
              <div className="text-xs text-slate-500">{listRows.length} shifts</div>
            </div>
            <table className="w-full min-w-[1000px] border-collapse">
              <thead className="bg-slate-50/80">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-2">Users</th>
                  <th className="border-b border-slate-200 px-3 py-2">Job</th>
                  <th className="border-b border-slate-200 px-3 py-2">Date</th>
                  <th className="border-b border-slate-200 px-3 py-2">Set times</th>
                  <th className="border-b border-slate-200 px-3 py-2">Shift total</th>
                  <th className="border-b border-slate-200 px-3 py-2">Status</th>
                  <th className="border-b border-slate-200 px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((s) => (
                  <tr key={s.id} className="text-sm text-slate-800 hover:bg-slate-50">
                    <td className="border-b border-slate-100 px-3 py-2">
                      <div className="font-medium">{s.assignedLabel}</div>
                      {s.assignedEmployeeNames.length > 1 ? (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {s.assignedEmployeeNames.slice(0, 4).join(", ")}
                          {s.assignedEmployeeNames.length > 4 ? "…" : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <span
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-semibold text-slate-800"
                        title={s.jobName ?? "—"}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: s.jobColorHex }}
                          aria-hidden
                        />
                        {s.jobName ?? "—"}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-sm text-slate-700">
                      {formatDateShort(s.shift_start)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 tabular-nums text-slate-700">
                      {formatSpan(s.shift_start, s.shift_end)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 tabular-nums text-slate-700">
                      {hoursBetweenIso(s.shift_start, s.shift_end)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      {!s.isPublished ? (
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200/60">
                          Draft
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200/60">
                          Published
                        </span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-sm text-slate-600">
                      {s.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* Row search + toggles */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-2 py-2">
              <div className="relative min-w-[200px] flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search shifts, jobs, people…"
                  className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800">
                Labor &amp; Sales
              </button>
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800">
                Daily info {showDailyInfo ? "On" : "Off"}
              </button>
            </div>

            <div className="min-w-[1100px]">
              {shifts.length === 0 ? (
                <div className="border-b border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      No shifts for this range{search ? " (try clearing search)" : ""}. Add a shift to start scheduling.
                    </span>
                    {canEditSchedule && !search.trim() ? (
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        disabled={seedPending}
                        title="Generate demo shifts for this week (draft)"
                        onClick={() => {
                          startSeedTransition(async () => {
                            const r = await seedDemoShiftsForWeek(weekParam);
                            if (!r.ok) {
                              window.alert(r.error);
                              return;
                            }
                            router.refresh();
                          });
                        }}
                      >
                        {seedPending ? "Generating…" : "Generate demo week"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div
                className="grid border-b border-slate-200 bg-slate-50/90"
                style={{ gridTemplateColumns: `200px repeat(${displayedColumns.length}, minmax(110px, 1fr))` }}
              >
                <div className="border-r border-slate-200 p-2" />
                {displayedColumns.map((col, di) => {
                  const isToday = sameCalendarDay(col.date, today);
                  return (
                    <div
                      key={di}
                      className={`border-r border-slate-200 p-2 text-center last:border-r-0 ${
                        isToday ? "bg-sky-100/80" : ""
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        {col.labelShort} {col.labelDayNum}
                      </div>
                      {showDailyInfo ? (
                        <div className="mt-1.5 flex items-center justify-center gap-2 text-[10px] font-medium text-slate-600">
                          <span className="inline-flex items-center gap-0.5" title="Hours">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {formatHoursClock(col.totalHours)}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="inline-flex items-center gap-0.5" title="Shifts">
                            <CalendarDays className="h-3 w-3 text-slate-400" />
                            {col.shiftCount}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="inline-flex items-center gap-0.5" title="Users">
                            <Users className="h-3 w-3 text-slate-400" />
                            {col.uniquePeople}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {shifts.length === 0 ? (
                <div className="border-b border-slate-100 bg-white">
                  {employeesForPicker.map((e) => (
                    <div
                      key={e.id}
                      className="grid border-b border-slate-100 last:border-b-0"
                      style={{
                        gridTemplateColumns: `200px repeat(${displayedColumns.length}, minmax(110px, 1fr))`,
                      }}
                    >
                      <div className="border-r border-slate-200 px-2 py-2">
                        {canEditSchedule ? (
                          <button
                            type="button"
                            className="w-full rounded-md px-1 py-0.5 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            onClick={() => openSchedulePanelForEmployee(e)}
                            title="Add or edit shifts for this team member"
                          >
                            <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                              {e.full_name}
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-500">
                              No shifts yet — click to add
                            </div>
                          </button>
                        ) : (
                          <Link
                            href={`/users/${e.id}`}
                            className="block w-full rounded-md px-1 py-0.5 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            title="Open employee profile"
                          >
                            <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                              {e.full_name}
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-500">No shifts yet</div>
                          </Link>
                        )}
                      </div>
                      {displayedColumns.map((col, di) => {
                        const isToday = sameCalendarDay(col.date, today);
                        const start = new Date(col.date);
                        start.setHours(9, 0, 0, 0);
                        const end = new Date(col.date);
                        end.setHours(17, 0, 0, 0);
                        return (
                          <div
                            key={di}
                            className={`group relative min-h-[64px] border-r border-slate-100 p-1 last:border-r-0 ${
                              isToday ? "bg-sky-50/50" : ""
                            }`}
                          >
                            {canEditSchedule ? (
                              <ScheduleCellHoverActions
                                menuKey={`empty-${e.id}-${di}`}
                                openMenuKey={cellMenuKey}
                                setOpenMenuKey={setCellMenuKey}
                                onQuickAdd={() =>
                                  openCreateShift({
                                    locationId: e.location_id,
                                    employeeIds: [e.id],
                                    start,
                                    end,
                                  })
                                }
                                onTimeOff={goTimeClockForTimeOff}
                                onUnavailability={openUnavailabilityComingSoon}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {employeesForPicker.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-600">
                      No active employees found for this location.
                    </div>
                  ) : null}

                  {canEditSchedule && !search.trim() ? (
                    <div className="px-4 py-4">
                      <button
                        type="button"
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                        onClick={() => {
                          setEditingShiftId(null);
                          setModalNonce((n) => n + 1);
                          setAddOpen(true);
                        }}
                      >
                        Add shift
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
              sections.map(({ name: section }) => {
                const st = sectionTotals(shifts, section);
                const jobs = jobRowsForSection(shifts, section);
                const inSection = shifts.filter((s) => s.groupName === section);
                const layerKey = inSection.find((s) => s.boardSectionLayerName)?.boardSectionLayerName;
                const metaExtras = [
                  ...new Set(inSection.flatMap((s) => s.extraLayerLabels)),
                ];
                const layerHint = layerKey ? `Layer · ${layerKey}` : null;
                return (
                  <div key={section} className="border-b border-slate-100 last:border-b-0">
                    {/* Hide section header when schedule is “all day” only. */}
                    {section !== "All day" ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100/90 px-3 py-2">
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">{section}</span>
                          {layerHint ? (
                            <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-500">
                              {layerHint}
                            </span>
                          ) : null}
                          {metaExtras.length ? (
                            <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                              {metaExtras.join(" · ")}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-xs tabular-nums text-slate-600">
                          <span className="font-medium text-slate-800">{formatHoursClock(st.hours)}</span>
                          <span className="mx-1 text-slate-300">|</span>
                          {st.shiftCount} shifts
                          <span className="mx-1 text-slate-300">|</span>
                          {st.people} users
                        </span>
                      </div>
                    ) : null}
                    {viewMode === "job" ? (
                      jobs.map((jobRow) => (
                      <div
                        key={`${section}-${jobRow.rowKey}`}
                        className="grid border-b border-slate-100 bg-white"
                        style={{
                          gridTemplateColumns: `200px repeat(7, minmax(110px, 1fr))`,
                          boxShadow: `inset 4px 0 0 0 ${jobRow.colorHex}`,
                        }}
                      >
                        <div className="border-r border-slate-200 px-2 py-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                            {jobRow.label}
                          </span>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            Row color matches shift cards
                          </div>
                        </div>
                        {displayedColumns.map((_, di) => {
                          const dayIndex = viewRange === "day"
                            ? Math.max(0, Math.min(6, Math.floor((displayedColumns[0]!.date.getTime() - weekMonday.getTime()) / 86400000)))
                            : di;
                          const cell = shiftsForCell(shifts, section, jobRow.rowKey, weekMonday, dayIndex);
                          const isToday = sameCalendarDay(columns[di].date, today);
                          const dateForCell = displayedColumns[di]?.date ?? columns[di]!.date;
                          const start = new Date(dateForCell);
                          start.setHours(9, 0, 0, 0);
                          const end = new Date(dateForCell);
                          end.setHours(17, 0, 0, 0);
                          const locSeed =
                            (!scopeAll && defaultLocationId) ||
                            locationsForPicker[0]?.id ||
                            undefined;
                          return (
                            <div
                              key={di}
                              className={`group relative min-h-[80px] border-r border-slate-100 p-1 last:border-r-0 ${
                                isToday ? "bg-sky-50/50" : ""
                              }`}
                            >
                              {canEditSchedule && cell.length === 0 ? (
                                <ScheduleCellHoverActions
                                  menuKey={`job-${section}-${jobRow.rowKey}-${di}`}
                                  openMenuKey={cellMenuKey}
                                  setOpenMenuKey={setCellMenuKey}
                                  onQuickAdd={() =>
                                    openCreateShift({
                                      locationId: locSeed,
                                      // In job view, we don't know which employee you intend.
                                      // Force selection in the side panel instead of auto-picking the first employee.
                                      employeeIds: [],
                                      jobId: jobRow.rowKey,
                                      start,
                                      end,
                                    })
                                  }
                                  onTimeOff={goTimeClockForTimeOff}
                                  onUnavailability={openUnavailabilityComingSoon}
                                />
                              ) : null}
                              <div className="relative z-[1] flex flex-col gap-1">
                                {cell.map((s) => (
                                  <div
                                    key={s.id}
                                    className="group relative w-full rounded-md border border-slate-200/90 bg-white text-left shadow-sm transition hover:shadow-md"
                                    style={{ borderTop: `3px solid ${s.jobColorHex}` }}
                                  >
                                    {s.notifyBadgeCount > 0 ? (
                                      <span className="absolute -left-1 -top-1 z-[1] flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white shadow">
                                        {s.notifyBadgeCount}
                                      </span>
                                    ) : null}
                                    {canEditSchedule ? (
                                      <button
                                        type="button"
                                        className="absolute right-0.5 top-0.5 z-[1] rounded p-0.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-red-600 group-hover:opacity-100"
                                        title="Delete shift"
                                        disabled={deletePending}
                                        aria-label="Delete shift"
                                        onClick={() => {
                                          if (
                                            !confirm(
                                              "Delete this shift? This cannot be undone.",
                                            )
                                          ) {
                                            return;
                                          }
                                          setDeleteError(null);
                                          startDeleteTransition(async () => {
                                            const r = await deleteShift({ shiftId: s.id });
                                            if (!r.ok) {
                                              setDeleteError(r.error);
                                              return;
                                            }
                                            afterMutation();
                                          });
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    ) : null}
                                    <div className="px-2 pb-1.5 pt-2 pr-7">
                                      <button
                                        type="button"
                                        className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-400"
                                        disabled={!canEditSchedule}
                                        title={
                                          canEditSchedule
                                            ? "Edit shift"
                                            : "You don’t have permission to edit shifts."
                                        }
                                        onClick={() => {
                                          if (!canEditSchedule) return;
                                          setDeleteError(null);
                                          setPublishError(null);
                                          setEditingShiftId(s.id);
                                          setModalNonce((n) => n + 1);
                                          setAddOpen(true);
                                        }}
                                      >
                                        <div className="text-[11px] font-semibold text-slate-900">
                                          {formatSpan(s.shift_start, s.shift_end)}
                                        </div>
                                        <div className="truncate text-[11px] text-slate-700">
                                          {s.assignedLabel}
                                        </div>
                                      </button>
                                      {scopeAll ? (
                                        <div className="mt-0.5 truncate text-[9px] text-slate-400">
                                          {locationNamesById.get(s.location_id) ?? "Store"}
                                        </div>
                                      ) : null}
                                      {!s.isPublished ? (
                                        <div className="mt-0.5 text-[9px] font-medium text-amber-700">
                                          Draft
                                        </div>
                                      ) : null}
                                      <div className="mt-1 flex justify-end text-[10px] font-medium tabular-nums text-slate-500">
                                        {s.assignCount}/{s.slotsTotal}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                    ) : (
                      employeesForPicker.map((emp) => (
                        <div
                          key={`${section}-${emp.id}`}
                          className="grid border-b border-slate-100 bg-white"
                          style={{
                            gridTemplateColumns: `200px repeat(7, minmax(110px, 1fr))`,
                            boxShadow: `inset 4px 0 0 0 #e2e8f0`,
                          }}
                        >
                          <div className="border-r border-slate-200 px-2 py-2">
                            {canEditSchedule ? (
                              <button
                                type="button"
                                className="w-full rounded-md px-1 py-0.5 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                onClick={() => openSchedulePanelForEmployee(emp)}
                                title="Add or edit shifts for this team member"
                              >
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                                  {emp.full_name}
                                </span>
                                <div className="mt-0.5 text-[10px] text-slate-500">View by users</div>
                              </button>
                            ) : (
                              <Link
                                href={`/users/${emp.id}`}
                                className="block w-full rounded-md px-1 py-0.5 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                title="Open employee profile"
                              >
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                                  {emp.full_name}
                                </span>
                                <div className="mt-0.5 text-[10px] text-slate-500">View by users</div>
                              </Link>
                            )}
                          </div>
                          {displayedColumns.map((_, di) => {
                            const dayIndex = viewRange === "day"
                              ? Math.max(0, Math.min(6, Math.floor((displayedColumns[0]!.date.getTime() - weekMonday.getTime()) / 86400000)))
                              : di;
                            const cell = shiftsForUserCell(shifts, section, emp.id, weekMonday, dayIndex);
                            const isToday = sameCalendarDay(columns[di].date, today);
                            const dateForCell = displayedColumns[di]?.date ?? columns[di]!.date;
                            const start = new Date(dateForCell);
                            start.setHours(9, 0, 0, 0);
                            const end = new Date(dateForCell);
                            end.setHours(17, 0, 0, 0);
                            const unKey = `${emp.id}:${toYmdLocal(dateForCell)}`;
                            const unBlocks = unavailByEmployeeDay.get(unKey) ?? [];
                            const locSeed =
                              employeesForPicker.find((e) => e.id === emp.id)?.location_id ||
                              ((!scopeAll && defaultLocationId) || locationsForPicker[0]?.id || undefined);
                            const locName = locationNamesById.get(locSeed ?? "") ?? locationLabel;
                            return (
                              <div
                                key={di}
                                className={`group relative min-h-[80px] border-r border-slate-100 p-1 last:border-r-0 ${
                                  isToday ? "bg-sky-50/50" : ""
                                }`}
                              >
                                {unBlocks.length ? (
                                  <div
                                    className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-amber-200/70"
                                    title={
                                      unBlocks
                                        .map((b) => {
                                          const s = new Date(b.start_at);
                                          const e = new Date(b.end_at);
                                          const span =
                                            Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())
                                              ? "Unavailable"
                                              : `${toHmLocal(s)}–${toHmLocal(e)}`;
                                          return `${span}${b.reason ? ` — ${b.reason}` : ""}`;
                                        })
                                        .join("\n")
                                    }
                                  >
                                    <div
                                      className="absolute inset-0 rounded-md bg-amber-50/70"
                                      style={{
                                        backgroundImage:
                                          "repeating-linear-gradient(135deg, rgba(245,158,11,0.22) 0px, rgba(245,158,11,0.22) 8px, rgba(255,251,235,0.65) 8px, rgba(255,251,235,0.65) 16px)",
                                      }}
                                    />
                                    <div className="absolute left-1 top-1 rounded-full bg-amber-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                                      Unavailable{unBlocks.length > 1 ? ` ×${unBlocks.length}` : ""}
                                    </div>
                                    {(() => {
                                      const first = unBlocks[0];
                                      if (!first) return null;
                                      const s = new Date(first.start_at);
                                      const e = new Date(first.end_at);
                                      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
                                      return (
                                        <div className="absolute left-1 top-6 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200/70">
                                          {toHmLocal(s)}–{toHmLocal(e)}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : null}
                                {canEditSchedule && cell.length === 0 ? (
                                  <ScheduleCellHoverActions
                                    menuKey={`user-${section}-${emp.id}-${di}`}
                                    openMenuKey={cellMenuKey}
                                    setOpenMenuKey={setCellMenuKey}
                                    onQuickAdd={() =>
                                      openCreateShift({
                                        locationId: locSeed,
                                        employeeIds: [emp.id],
                                        start,
                                        end,
                                      })
                                    }
                                    onTimeOff={goTimeClockForTimeOff}
                                    onUnavailability={() =>
                                      unBlocks.length
                                        ? startDeleteTransition(async () => {
                                            const r = await deleteUnavailability({
                                              unavailabilityId: unBlocks[0]!.id,
                                            });
                                            if (!r.ok) {
                                              window.alert(r.error);
                                              return;
                                            }
                                            router.refresh();
                                          })
                                        : openUnavailability({
                                            employeeId: emp.id,
                                            employeeName: emp.full_name,
                                            locationId: locSeed ?? emp.location_id,
                                            locationName: locName,
                                            start,
                                            end,
                                          })
                                    }
                                    unavailabilityLabel={
                                      unBlocks.length
                                        ? `Remove unavailability${unBlocks.length > 1 ? " (earliest)" : ""}`
                                        : "Add unavailability"
                                    }
                                  />
                                ) : null}
                                <div className="relative z-[1] flex flex-col gap-1">
                                  {cell.map((s) => (
                                    <div
                                      key={s.id}
                                      className="group relative w-full rounded-md border border-slate-200/90 bg-white text-left shadow-sm transition hover:shadow-md"
                                      style={{ borderTop: `3px solid ${s.jobColorHex}` }}
                                    >
                                      {canEditSchedule ? (
                                        <button
                                          type="button"
                                          className="absolute right-0.5 top-0.5 z-[1] rounded p-0.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-red-600 group-hover:opacity-100"
                                          title="Delete shift"
                                          disabled={deletePending}
                                          aria-label="Delete shift"
                                          onClick={() => {
                                            if (
                                              !confirm(
                                                "Delete this shift? This cannot be undone.",
                                              )
                                            ) {
                                              return;
                                            }
                                            setDeleteError(null);
                                            startDeleteTransition(async () => {
                                              const r = await deleteShift({ shiftId: s.id });
                                              if (!r.ok) {
                                                setDeleteError(r.error);
                                                return;
                                              }
                                              afterMutation();
                                            });
                                          }}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      ) : null}
                                      <div className="px-2 pb-1.5 pt-2 pr-7">
                                        <button
                                          type="button"
                                          className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-400"
                                          disabled={!canEditSchedule}
                                          title={
                                            canEditSchedule
                                              ? "Edit shift"
                                              : "You don’t have permission to edit shifts."
                                          }
                                          onClick={() => {
                                            if (!canEditSchedule) return;
                                            setDeleteError(null);
                                            setPublishError(null);
                                            setEditingShiftId(s.id);
                                            setModalNonce((n) => n + 1);
                                            setAddOpen(true);
                                          }}
                                        >
                                          <div className="text-[11px] font-semibold text-slate-900">
                                            {formatSpan(s.shift_start, s.shift_end)}
                                          </div>
                                          <div className="truncate text-[11px] text-slate-700">
                                            {s.jobName ?? "No job"}
                                          </div>
                                        </button>
                                        {!s.isPublished ? (
                                          <div className="mt-0.5 text-[9px] font-medium text-amber-700">
                                            Draft
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                );
              })
              )}
            </div>
          </div>
        )}
        </div>

        {showWeeklySummary ? (
        <div className="sticky bottom-0 z-10 rounded-lg border border-slate-200 bg-slate-100/95 px-4 py-2.5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Weekly summary
            </span>
            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-700">
              <span className="tabular-nums">
                <span className="font-semibold text-slate-900">{formatHoursClock(totals.hours)}</span>{" "}
                hours
              </span>
              <span>
                <span className="font-semibold text-slate-900">{totals.shiftCount}</span> shifts
              </span>
              <span>
                <span className="font-semibold text-slate-900">{totals.people}</span> users
              </span>
              {topJobs.length ? (
                <span className="text-slate-600">
                  Top jobs:{" "}
                  <span className="font-medium text-slate-800">
                    {topJobs.map((j) => `${j.job} ${formatHoursClock(j.hours)}`).join(" • ")}
                  </span>
                </span>
              ) : (
                <span className="text-slate-400">Top jobs —</span>
              )}
            </div>
          </div>
        </div>
        ) : null}
    </div>
  );
}
