"use client";

import { Loader2, X } from "lucide-react";
import {
  useId,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { addShiftTask, deleteShiftTask, listShiftTasks, toggleShiftTask, createShift, updateShift } from "@/app/actions/schedule";
import { addDays } from "@/lib/schedule/week";

export type ScheduleEmployeeOption = {
  id: string;
  full_name: string;
  location_id: string;
};

export type ScheduleLocationOption = {
  id: string;
  name: string;
};

export type ScheduleJobOption = {
  id: string;
  location_id: string;
  name: string;
};

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function defaultDayOffset(weekMonday: Date): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const mon = new Date(weekMonday);
  mon.setHours(12, 0, 0, 0);
  for (let d = 0; d < 7; d++) {
    const day = addDays(mon, d);
    if (sameCalendarDay(day, today)) return d;
  }
  return 0;
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromIsoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toDatetimeLocalValue(d);
}

type Props = {
  open: boolean;
  onClose: () => void;
  weekMonday: Date;
  scopeAll: boolean;
  locations: ScheduleLocationOption[];
  /** When header is a single store, preselect this location. */
  defaultLocationId: string | null;
  employees: ScheduleEmployeeOption[];
  jobs: ScheduleJobOption[];
  onSuccess: () => void;
  /** When set, modal edits an existing shift instead of creating one. */
  initialShift?: {
    id: string;
    employee_id: string;
    location_id: string;
    shift_start: string;
    shift_end: string;
    notes: string | null;
  } | null;
  /** Prefill values for create (Connecteam-like “add from cell”). */
  initialCreate?: {
    locationId?: string;
    employeeIds?: string[];
    jobId?: string;
    start?: Date;
    end?: Date;
    notes?: string;
  } | null;
  /** Unavailability blocks in the currently loaded range (used for overlap warnings). */
  contextUnavailability?: {
    id: string;
    employee_id: string;
    location_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
  }[];
  /** Shifts in the currently loaded range (used for “Shift tasks” tab + overlap checks). */
  contextShifts?: {
    id: string;
    employee_id?: string;
    location_id: string;
    shift_start: string;
    shift_end: string;
    jobName?: string | null;
    assignedEmployeeIds?: string[];
    assignedEmployeeNames?: string[];
    assignedLabel?: string;
  }[];
  /** Change this value to force a clean remount/reset. */
  modalKey?: string | number;
};

export function AddShiftModal({
  open,
  onClose,
  weekMonday,
  scopeAll,
  locations,
  defaultLocationId,
  employees,
  jobs,
  onSuccess,
  initialShift = null,
  initialCreate = null,
  contextUnavailability = [],
  contextShifts = [],
  modalKey,
}: Props) {
  const baseId = useId();
  const [pending, startTransition] = useTransition();
  const isEdit = initialShift != null;
  const [tab, setTab] = useState<"details" | "tasks">("details");
  const [submitMode, setSubmitMode] = useState<"draft" | "publish">("publish");
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [shiftTasks, setShiftTasks] = useState<
    {
      id: string;
      title: string;
      is_completed: boolean;
      sort_order: number;
      completed_at: string | null;
      completed_by_employee_id: string | null;
      created_at: string;
    }[]
  >([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedTasksShiftId, setSelectedTasksShiftId] = useState<string | null>(null);

  const initialValues = useMemo(() => {
    if (initialShift) {
      return {
        locationId: initialShift.location_id,
        employeeId: initialShift.employee_id,
        jobId: "",
        startLocal: fromIsoToDatetimeLocalValue(initialShift.shift_start),
        endLocal: fromIsoToDatetimeLocalValue(initialShift.shift_end),
        notes: initialShift.notes ?? "",
      };
    }
    const dayOff = defaultDayOffset(weekMonday);
    const fallbackDay = addDays(weekMonday, dayOff);
    const fallbackStart = new Date(fallbackDay);
    fallbackStart.setHours(9, 0, 0, 0);
    const fallbackEnd = new Date(fallbackDay);
    fallbackEnd.setHours(17, 0, 0, 0);

    const loc =
      initialCreate?.locationId ||
      ((!scopeAll && defaultLocationId) || locations[0]?.id || "");
    const firstEmp = employees.find((e) => e.location_id === loc)?.id ?? "";
    const seededEmp = initialCreate?.employeeIds?.[0] || firstEmp;

    const start = initialCreate?.start ? new Date(initialCreate.start) : fallbackStart;
    const end = initialCreate?.end ? new Date(initialCreate.end) : fallbackEnd;
    return {
      locationId: loc,
      employeeId: seededEmp,
      jobId: initialCreate?.jobId || "",
      startLocal: toDatetimeLocalValue(start),
      endLocal: toDatetimeLocalValue(end),
      notes: initialCreate?.notes ?? "",
    };
  }, [initialShift, initialCreate, weekMonday, scopeAll, defaultLocationId, locations, employees]);

  const [error, setError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string>(initialValues.locationId);
  const [employeeIds, setEmployeeIds] = useState<string[]>(
    initialCreate?.employeeIds?.length
      ? initialCreate.employeeIds
      : initialValues.employeeId
        ? [initialValues.employeeId]
        : [],
  );
  const [jobId, setJobId] = useState<string>(initialValues.jobId);
  const [startLocal, setStartLocal] = useState(initialValues.startLocal);
  const [endLocal, setEndLocal] = useState(initialValues.endLocal);
  const [notes, setNotes] = useState(initialValues.notes);

  const employeesAtLocation = useMemo(
    () => employees.filter((e) => e.location_id === locationId),
    [employees, locationId],
  );
  const jobsAtLocation = useMemo(
    () => jobs.filter((j) => j.location_id === locationId),
    [jobs, locationId],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!locationId || employeeIds.length === 0 || !jobId || !startLocal || !endLocal) {
      setError("Choose a store, job, at least one employee, and times.");
      return;
    }
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Invalid times.");
      return;
    }
    setError(null);
    const isPublished = submitMode === "publish";
    startTransition(async () => {
      const r = isEdit
        ? await updateShift({
            shiftId: initialShift!.id,
            employeeIds,
            locationId,
            jobId,
            shiftStartIso: start.toISOString(),
            shiftEndIso: end.toISOString(),
            notes: notes.trim() || null,
            isPublished,
          })
        : await createShift({
            employeeIds,
            locationId,
            jobId,
            shiftStartIso: start.toISOString(),
            shiftEndIso: end.toISOString(),
            notes: notes.trim() || null,
            isPublished,
          });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onSuccess();
      onClose();
    });
  };

  const startDt = useMemo(() => new Date(startLocal), [startLocal]);
  const endDt = useMemo(() => new Date(endLocal), [endLocal]);
  const selectedYmd = startLocal.slice(0, 10);

  const overlappingUnavailability = useMemo(() => {
    if (!locationId || employeeIds.length === 0) return [];
    if (!startLocal || !endLocal) return [];
    if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime())) return [];
    if (endDt <= startDt) return [];

    const empNameById = new Map(employees.map((e) => [e.id, e.full_name] as const));
    const overlaps: { employeeName: string; reason: string | null }[] = [];
    for (const u of contextUnavailability) {
      if (u.location_id !== locationId) continue;
      if (!employeeIds.includes(u.employee_id)) continue;
      const uStart = new Date(u.start_at);
      const uEnd = new Date(u.end_at);
      if (Number.isNaN(uStart.getTime()) || Number.isNaN(uEnd.getTime())) continue;
      const isOverlap = startDt < uEnd && endDt > uStart;
      if (!isOverlap) continue;
      overlaps.push({
        employeeName: empNameById.get(u.employee_id) ?? "Employee",
        reason: u.reason ?? null,
      });
    }
    return overlaps;
  }, [contextUnavailability, employeeIds, employees, endDt, endLocal, locationId, startDt, startLocal]);

  const overlappingOtherShifts = useMemo(() => {
    if (!locationId || employeeIds.length === 0) return [];
    if (!startLocal || !endLocal) return [];
    if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime())) return [];
    if (endDt <= startDt) return [];

    const overlaps: { label: string }[] = [];
    for (const s of contextShifts) {
      if (s.location_id !== locationId) continue;
      if (initialShift && s.id === initialShift.id) continue;
      const ids =
        s.assignedEmployeeIds && s.assignedEmployeeIds.length > 0
          ? s.assignedEmployeeIds
          : s.employee_id
            ? [s.employee_id]
            : [];
      if (!ids.some((id) => employeeIds.includes(id))) continue;
      const sStart = new Date(s.shift_start);
      const sEnd = new Date(s.shift_end);
      if (Number.isNaN(sStart.getTime()) || Number.isNaN(sEnd.getTime())) continue;
      if (!(startDt < sEnd && endDt > sStart)) continue;
      const who =
        s.assignedLabel?.trim() ||
        (s.assignedEmployeeNames?.length ? s.assignedEmployeeNames.join(", ") : null) ||
        "Shift";
      const job = s.jobName?.trim();
      overlaps.push({ label: job ? `${job} · ${who}` : who });
    }
    return overlaps;
  }, [
    contextShifts,
    employeeIds,
    endDt,
    endLocal,
    initialShift,
    locationId,
    startDt,
    startLocal,
  ]);

  const blockingUnavailability = overlappingUnavailability.length > 0;
  const blockingShiftOverlap = overlappingOtherShifts.length > 0;
  const blockingOverlap = blockingUnavailability || blockingShiftOverlap;
  const shiftOptionsForDate = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedYmd)) return [];
    return contextShifts
      .filter((s) => {
        if (locationId && s.location_id !== locationId) return false;
        return s.shift_start.slice(0, 10) === selectedYmd;
      })
      .slice()
      .sort((a, b) => a.shift_start.localeCompare(b.shift_start));
  }, [contextShifts, selectedYmd, locationId]);
  const hoursLabel =
    Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime()) || endDt <= startDt
      ? "—"
      : `${String(Math.floor((endDt.getTime() - startDt.getTime()) / 3600000)).padStart(2, "0")}:${String(
          Math.round(((endDt.getTime() - startDt.getTime()) % 3600000) / 60000),
        ).padStart(2, "0")} Hours`;
  const headerDateLabel =
    Number.isNaN(startDt.getTime())
      ? "Shift"
      : startDt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "2-digit", year: "numeric" });

  if (!open) return null;

  const derivedActiveShiftId =
    selectedTasksShiftId ?? initialShift?.id ?? shiftOptionsForDate[0]?.id ?? null;

  return (
    <div
      key={modalKey}
      className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-labelledby={`${baseId}-title`}
        aria-modal="true"
      >
        <div className="border-b border-slate-200 px-5 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {headerDateLabel}
              </div>
              <h2 id={`${baseId}-title`} className="mt-1 truncate text-base font-semibold text-slate-900">
                Shift details
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                tab === "details" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setTab("details")}
            >
              Shift details
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                tab === "tasks" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setTab("tasks")}
            >
              Shift tasks
            </button>
          </div>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {tab === "tasks" ? (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shift tasks</div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <label className="block text-xs font-medium text-slate-700">Select shift</label>
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={derivedActiveShiftId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setSelectedTasksShiftId(v);
                      setTasksError(null);
                      setShiftTasks([]);
                    }}
                    disabled={shiftOptionsForDate.length === 0}
                  >
                    {shiftOptionsForDate.length === 0 ? (
                      <option value="">No shifts on {selectedYmd}</option>
                    ) : null}
                    {shiftOptionsForDate.map((s) => {
                      const who =
                        s.assignedEmployeeNames?.length
                          ? s.assignedEmployeeNames.join(", ")
                          : s.assignedLabel ?? "—";
                      const start = new Date(s.shift_start);
                      const end = new Date(s.shift_end);
                      const span =
                        Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
                          ? "—"
                          : `${start.toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}–${end.toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`;
                      const job = s.jobName ? `${s.jobName} · ` : "";
                      return (
                        <option key={s.id} value={s.id}>
                          {who} — {job}
                          {span}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Showing shifts on <span className="font-medium text-slate-700">{selectedYmd}</span>.
                  </p>
                </div>

                {!derivedActiveShiftId ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                    <div className="text-sm font-semibold text-slate-900">No shift selected</div>
                    <p className="mt-2 text-sm text-slate-600">Create a shift first, then add tasks.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={tasksLoading}
                      onClick={async () => {
                        setTasksError(null);
                        setTasksLoading(true);
                        const r = await listShiftTasks(derivedActiveShiftId);
                        setTasksLoading(false);
                        if (!r.ok) {
                          setTasksError(r.error);
                          return;
                        }
                        setShiftTasks(r.tasks);
                      }}
                    >
                      {tasksLoading ? "Loading…" : "Load tasks"}
                    </button>

                    {tasksError ? (
                      <p className="text-xs font-medium text-red-600" role="alert">
                        {tasksError}
                      </p>
                    ) : null}

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="Add a task…"
                          className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                          type="button"
                          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          disabled={tasksLoading || !newTaskTitle.trim()}
                          onClick={async () => {
                            const title = newTaskTitle.trim();
                            if (!title) return;
                            setTasksError(null);
                            setTasksLoading(true);
                            const r = await addShiftTask({ shiftId: derivedActiveShiftId, title });
                            if (!r.ok) {
                              setTasksLoading(false);
                              setTasksError(r.error);
                              return;
                            }
                            const list = await listShiftTasks(derivedActiveShiftId);
                            setTasksLoading(false);
                            if (list.ok) setShiftTasks(list.tasks);
                            setNewTaskTitle("");
                          }}
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {shiftTasks.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-600">No tasks yet.</div>
                      ) : (
                        shiftTasks.map((t) => (
                          <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <label className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={t.is_completed}
                                onChange={async (e) => {
                                  const on = e.target.checked;
                                  await toggleShiftTask({ taskId: t.id, isCompleted: on });
                                  const list = await listShiftTasks(derivedActiveShiftId);
                                  if (list.ok) setShiftTasks(list.tasks);
                                }}
                              />
                              <span className={`truncate text-sm ${t.is_completed ? "text-slate-400 line-through" : "text-slate-900"}`}>
                                {t.title}
                              </span>
                            </label>
                            <button
                              type="button"
                              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-red-600"
                              onClick={async () => {
                                await deleteShiftTask(t.id);
                                const list = await listShiftTasks(derivedActiveShiftId);
                                if (list.ok) setShiftTasks(list.tasks);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div>
                    <label htmlFor={`${baseId}-date`} className="block text-xs font-medium text-slate-700">
                      Date
                    </label>
                    <input
                      id={`${baseId}-date`}
                      type="date"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={startLocal.slice(0, 10)}
                      onChange={(e) => {
                        const ymd = e.target.value;
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
                        setStartLocal((prev) => `${ymd}${prev.slice(10)}`);
                        setEndLocal((prev) => `${ymd}${prev.slice(10)}`);
                      }}
                      required
                    />
                  </div>
                  <div className="pt-6 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Total
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">
                      {hoursLabel}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${baseId}-start`} className="block text-xs font-medium text-slate-700">
                      Start
                    </label>
                    <input
                      id={`${baseId}-start`}
                      type="time"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={startLocal.slice(11, 16)}
                      onChange={(e) => {
                        const t = e.target.value;
                        if (!/^\d{2}:\d{2}$/.test(t)) return;
                        setStartLocal((prev) => `${prev.slice(0, 11)}${t}`);
                      }}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={`${baseId}-end`} className="block text-xs font-medium text-slate-700">
                      End
                    </label>
                    <input
                      id={`${baseId}-end`}
                      type="time"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={endLocal.slice(11, 16)}
                      onChange={(e) => {
                        const t = e.target.value;
                        if (!/^\d{2}:\d{2}$/.test(t)) return;
                        setEndLocal((prev) => `${prev.slice(0, 11)}${t}`);
                      }}
                      required
                    />
                  </div>
                </div>

                {overlappingUnavailability.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                    <div className="font-semibold">Unavailability overlap</div>
                    <div className="mt-0.5 text-amber-800">
                      {overlappingUnavailability
                        .slice(0, 3)
                        .map((o) => `${o.employeeName}${o.reason ? ` — ${o.reason}` : ""}`)
                        .join(" • ")}
                      {overlappingUnavailability.length > 3 ? " • …" : null}
                    </div>
                  </div>
                ) : null}

                {overlappingOtherShifts.length > 0 ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-900">
                    <div className="font-semibold">Overlapping shift</div>
                    <div className="mt-0.5 text-rose-800">
                      {overlappingOtherShifts
                        .slice(0, 3)
                        .map((o) => o.label)
                        .join(" • ")}
                      {overlappingOtherShifts.length > 3 ? " • …" : null}
                    </div>
                  </div>
                ) : null}

          {scopeAll ? (
            <div>
              <label htmlFor={`${baseId}-loc`} className="block text-xs font-medium text-slate-700">
                Store
              </label>
              <select
                id={`${baseId}-loc`}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={locationId}
                onChange={(e) => {
                  const next = e.target.value;
                  setLocationId(next);
                  const nextEmp = employees.find((x) => x.location_id === next)?.id ?? "";
                  setEmployeeIds(nextEmp ? [nextEmp] : []);
                  const nextJob = jobs.find((j) => j.location_id === next)?.id ?? "";
                  setJobId(nextJob);
                }}
                required
              >
                <option value="">Select store…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Store:{" "}
              <span className="font-medium text-slate-800">
                {locations.find((l) => l.id === locationId)?.name ?? "—"}
              </span>
            </p>
          )}

          <div>
            <label htmlFor={`${baseId}-job`} className="block text-xs font-medium text-slate-700">
              Job
            </label>
            <select
              id={`${baseId}-job`}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              required
              disabled={!locationId || jobsAtLocation.length === 0}
            >
              <option value="">
                {!locationId ? "Select a store first…" : jobsAtLocation.length === 0 ? "No jobs set up" : "Select job…"}
              </option>
              {jobsAtLocation.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-slate-700">Employees</label>
              <span className="text-[11px] font-medium text-slate-500">
                {employeeIds.length} selected
              </span>
            </div>
            <div className="mt-1 max-h-44 overflow-auto rounded-md border border-slate-200 bg-white p-2">
              {!locationId ? (
                <p className="px-1 py-2 text-xs text-slate-500">Select a store first…</p>
              ) : employeesAtLocation.length === 0 ? (
                <p className="px-1 py-2 text-xs text-slate-500">No active employees</p>
              ) : (
                <div className="space-y-1">
                  {employeesAtLocation.map((e) => {
                    const checked = employeeIds.includes(e.id);
                    return (
                      <label
                        key={e.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={checked}
                          onChange={(ev) => {
                            const on = ev.target.checked;
                            setEmployeeIds((prev) => {
                              if (on) return [...prev, e.id];
                              return prev.filter((x) => x !== e.id);
                            });
                          }}
                        />
                        <span className="text-sm text-slate-900">{e.full_name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              {/* Times moved to the top of the panel to match Connecteam. */}
            </div>
          </div>

          <div>
            <label htmlFor={`${baseId}-notes`} className="block text-xs font-medium text-slate-700">
              Notes <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id={`${baseId}-notes`}
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Register, opening, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error ? (
            <p className="text-xs font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white px-5 py-3">
            {error ? (
              <p className="mb-2 text-xs font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            {blockingOverlap ? (
              <p className="mb-2 text-xs font-medium text-amber-700" role="alert">
                {blockingUnavailability && blockingShiftOverlap
                  ? "Can’t save: overlaps both unavailability and another shift for this time."
                  : blockingUnavailability
                    ? "Can’t save this shift because it overlaps an unavailability block."
                    : "Can’t save: one or more selected people already have another shift at this time."}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={pending || employeeIds.length === 0 || blockingOverlap}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  title="Save as draft (not visible to employees until published)"
                  onClick={() => setSubmitMode("draft")}
                >
                  Save draft
                </button>
                <button
                  type="submit"
                  disabled={pending || employeeIds.length === 0 || blockingOverlap}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => setSubmitMode("publish")}
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Publish
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
