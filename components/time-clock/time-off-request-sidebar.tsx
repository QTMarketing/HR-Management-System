"use client";

import { createManagerTimeOffRecord } from "@/app/actions/time-off-record";
import {
  dateYmdToLocalDayEndIso,
  dateYmdToLocalDayStartIso,
  datetimeLocalValueToIso,
} from "@/lib/time-clock/datetime-local";
import { TIME_OFF_TYPES } from "@/lib/time-clock/time-off-types";
import { X } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";

export type StoreEmployeeOption = {
  id: string;
  fullName: string;
};

const WORK_HOURS_PER_DAY = 8;

/**
 * Derive total hours + day equivalents from start/end.
 * — All day: inclusive calendar days; hours = days × 8 (standard full-day length).
 * — Date/time: elapsed hours (rounded to 0.25h); days = hours ÷ 8 (work-day equivalents).
 */
function computeHoursAndDaysFromRange(
  allDay: boolean,
  startRaw: string,
  endRaw: string,
): { totalHours: string; daysOfLeave: string } | null {
  const start = startRaw.trim();
  const end = endRaw.trim();
  if (!start || !end) return null;

  if (allDay) {
    const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
    if (!m1 || !m2) return null;
    const d0 = new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
    const d1 = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
    if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime()) || d1 < d0) return null;
    const inclusiveDays = Math.floor((d1.getTime() - d0.getTime()) / 86400000) + 1;
    const hours = inclusiveDays * WORK_HOURS_PER_DAY;
    return {
      totalHours: String(Math.round(hours * 4) / 4),
      daysOfLeave: String(inclusiveDays),
    };
  }

  const t0 = Date.parse(start);
  const t1 = Date.parse(end);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) return null;
  const durationHours = (t1 - t0) / 3600000;
  const roundedHours = Math.round(durationHours * 4) / 4;
  const dayEquiv = durationHours / WORK_HOURS_PER_DAY;
  const roundedDays = Math.round(dayEquiv * 100) / 100;
  return {
    totalHours: String(roundedHours),
    daysOfLeave: roundedDays < 0.005 ? "0" : String(roundedDays),
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Employee whose timecard is open — default selection. */
  defaultEmployeeId: string;
  defaultEmployeeName: string;
  storeEmployees: StoreEmployeeOption[];
  /** Store for validation (must match employee location). */
  locationId?: string;
  /** After a successful save (e.g. router.refresh). */
  onSaved?: () => void;
};

/**
 * Right drawer for managers to record time off for a store employee.
 */
export function TimeOffRequestSidebar({
  open,
  onClose,
  defaultEmployeeId,
  defaultEmployeeName,
  storeEmployees,
  locationId,
  onSaved,
}: Props) {
  const baseId = useId();
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [timeOffType, setTimeOffType] = useState<string>(TIME_OFF_TYPES[0]);
  const [allDay, setAllDay] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [days, setDays] = useState("");
  const [managerNotes, setManagerNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setEmployeeId(defaultEmployeeId);
      setFormError(null);
    }
  }, [open, defaultEmployeeId]);

  /** Auto-fill total hours + days when start/end change (still editable). */
  useEffect(() => {
    if (!open) return;
    const s = startAt.trim();
    const e = endAt.trim();
    if (!s || !e) {
      setTotalHours("");
      setDays("");
      return;
    }
    const derived = computeHoursAndDaysFromRange(allDay, startAt, endAt);
    if (!derived) {
      setTotalHours("");
      setDays("");
      return;
    }
    setTotalHours(derived.totalHours);
    setDays(derived.daysOfLeave);
  }, [open, allDay, startAt, endAt]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function parseOptionalNumber(raw: string): number | null {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!locationId?.trim()) {
      setFormError("Store context is missing — refresh the page and try again.");
      return;
    }
    if (!startAt.trim() || !endAt.trim()) {
      setFormError("Enter start and end.");
      return;
    }

    let startIso: string;
    let endIso: string;
    if (allDay) {
      startIso = dateYmdToLocalDayStartIso(startAt);
      endIso = dateYmdToLocalDayEndIso(endAt);
    } else {
      startIso = datetimeLocalValueToIso(startAt);
      endIso = datetimeLocalValueToIso(endAt);
    }
    if (!startIso || !endIso) {
      setFormError("Could not read start or end time.");
      return;
    }
    if (Date.parse(endIso) < Date.parse(startIso)) {
      setFormError("End must be on or after start.");
      return;
    }

    const th = parseOptionalNumber(totalHours);
    const dLeave = parseOptionalNumber(days);
    const notes = managerNotes.trim();

    startTransition(async () => {
      const res = await createManagerTimeOffRecord({
        locationId: locationId.trim(),
        employeeId,
        timeOffType,
        allDay,
        startAtIso: startIso,
        endAtIso: endIso,
        totalHours: th,
        daysOfLeave: dLeave,
        managerNotes: notes.length > 0 ? notes : null,
      });
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      onSaved?.();
      onClose();
    });
  }

  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-[115] bg-slate-900/40"
        aria-label="Close time off panel"
        onClick={onClose}
      />
      <aside
        className="absolute inset-y-0 right-0 z-[120] flex w-[30%] min-w-[min(100%,20rem)] max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id={`${baseId}-title`} className="text-sm font-semibold text-slate-900">
            Add time off
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {formError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
              {formError}
            </p>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${baseId}-emp`}>
              Employee
            </label>
            <select
              id={`${baseId}-emp`}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              {storeEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName}
                  {emp.id === defaultEmployeeId ? " (this timecard)" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              Defaults to {defaultEmployeeName}. Others are limited to this store.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${baseId}-type`}>
              Time off type
            </label>
            <select
              id={`${baseId}-type`}
              value={timeOffType}
              onChange={(e) => setTimeOffType(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              {TIME_OFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
            <span className="text-sm font-medium text-slate-800">All day</span>
            <button
              type="button"
              role="switch"
              aria-checked={allDay}
              onClick={() => setAllDay((v) => !v)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                allDay ? "bg-orange-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  allDay ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${baseId}-start`}>
                {allDay ? "Start date" : "Start date & time"}
              </label>
              <input
                id={`${baseId}-start`}
                type={allDay ? "date" : "datetime-local"}
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${baseId}-end`}>
                {allDay ? "End date" : "End date & time"}
              </label>
              <input
                id={`${baseId}-end`}
                type={allDay ? "date" : "datetime-local"}
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${baseId}-hours`}>
                Total hours (optional)
              </label>
              <input
                id={`${baseId}-hours`}
                type="number"
                min={0}
                step={0.25}
                placeholder="from start / end"
                value={totalHours}
                onChange={(e) => setTotalHours(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400/70 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${baseId}-days`}>
                Days of leave
              </label>
              <input
                id={`${baseId}-days`}
                type="number"
                min={0}
                step={0.5}
                placeholder="from start / end"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400/70 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Total hours and days of leave update from start and end (all-day: calendar days × 8 h; date/time:
            elapsed hours and ÷8 for day equivalents). You can still edit them before saving.
          </p>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${baseId}-notes`}>
              Manager notes
            </label>
            <textarea
              id={`${baseId}-notes`}
              rows={4}
              placeholder="add manager notes"
              value={managerNotes}
              onChange={(e) => setManagerNotes(e.target.value)}
              className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400/50 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          <div className="mt-auto flex gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Saved to this store’s time off records (approved). PTO balances and employee requests are planned next.
          </p>
        </form>
      </aside>
    </>
  );
}
