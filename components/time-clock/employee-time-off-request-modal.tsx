"use client";

import { requestEmployeeTimeOff } from "@/app/actions/time-off-record";
import {
  dateYmdToLocalDayEndIso,
  dateYmdToLocalDayStartIso,
  datetimeLocalValueToIso,
} from "@/lib/time-clock/datetime-local";
import { computeHoursAndDaysFromRange } from "@/lib/time-clock/time-off-request-helpers";
import { TIME_OFF_TYPES } from "@/lib/time-clock/time-off-types";
import { X } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  locationId: string;
  employeeId: string;
  onSaved?: () => void;
};

export function EmployeeTimeOffRequestModal({
  open,
  onClose,
  locationId,
  employeeId,
  onSaved,
}: Props) {
  const baseId = useId();
  const [timeOffType, setTimeOffType] = useState<string>(TIME_OFF_TYPES[0]);
  const [allDay, setAllDay] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [employeeNotes, setEmployeeNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Derived hours/days computed on submit; not stored as state.

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Note: derived hours/days are computed, not stored as state.

  if (!open) return null;

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(null);
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

    startTransition(async () => {
      const d = computeHoursAndDaysFromRange(allDay, startAt, endAt);
      const res = await requestEmployeeTimeOff({
        locationId,
        employeeId,
        timeOffType,
        allDay,
        startAtIso: startIso,
        endAtIso: endIso,
        totalHours: d?.totalHours ?? "",
        daysOfLeave: d?.daysOfLeave ?? "",
        employeeNotes: employeeNotes.trim() || null,
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
        className="fixed inset-0 z-[130] bg-slate-900/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[140] w-[min(100%,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={`${baseId}-title`} className="text-sm font-semibold text-slate-900">
            Request time off
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Your manager will review this request. You’ll see approved time off on the time clock after
          approval.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {formError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              {formError}
            </p>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${baseId}-type`}>
              Type
            </label>
            <select
              id={`${baseId}-type`}
              value={timeOffType}
              onChange={(e) => setTimeOffType(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
            >
              {TIME_OFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
            <span className="text-sm text-slate-800">All day</span>
            <button
              type="button"
              role="switch"
              aria-checked={allDay}
              onClick={() => setAllDay((v) => !v)}
              className={`relative h-6 w-11 rounded-full ${allDay ? "bg-orange-500" : "bg-slate-300"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${allDay ? "left-5" : "left-0.5"}`}
              />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-600" htmlFor={`${baseId}-s`}>
                {allDay ? "Start" : "Start"}
              </label>
              <input
                id={`${baseId}-s`}
                type={allDay ? "date" : "datetime-local"}
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600" htmlFor={`${baseId}-e`}>
                End
              </label>
              <input
                id={`${baseId}-e`}
                type={allDay ? "date" : "datetime-local"}
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600" htmlFor={`${baseId}-note`}>
              Note to manager (optional)
            </label>
            <textarea
              id={`${baseId}-note`}
              rows={2}
              value={employeeNotes}
              onChange={(e) => setEmployeeNotes(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="e.g. doctor appointment"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
