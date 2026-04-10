"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { createUnavailability } from "@/app/actions/schedule";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  locationId: string;
  locationName: string;
  start: Date;
  end: Date;
  onSuccess: () => void;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AddUnavailabilityModal({
  open,
  onClose,
  employeeId,
  employeeName,
  locationId,
  locationName,
  start,
  end,
  onSuccess,
}: Props) {
  const baseId = useId();
  const [pending, startTransition] = useTransition();
  const initial = useMemo(() => {
    const s = new Date(start);
    const e = new Date(end);
    return {
      date: toYmd(s),
      startTime: toHm(s),
      endTime: toHm(e),
      reason: "",
    };
  }, [start, end]);

  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [reason, setReason] = useState(initial.reason);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      setError("Choose a date and valid times.");
      return;
    }
    const s = new Date(`${date}T${startTime}:00`);
    const en = new Date(`${date}T${endTime}:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime()) || en <= s) {
      setError("End must be after start.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await createUnavailability({
        employeeId,
        locationId,
        startAtIso: s.toISOString(),
        endAtIso: en.toISOString(),
        reason: reason.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onSuccess();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
      >
        <div className="border-b border-slate-200 px-5 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Unavailability
              </div>
              <h2 id={`${baseId}-title`} className="mt-1 truncate text-base font-semibold text-slate-900">
                {employeeName}
              </h2>
              <p className="mt-1 text-xs text-slate-500">Store: {locationName}</p>
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
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">Date</label>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">Start</label>
                <input
                  type="time"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">End</label>
                <input
                  type="time"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Reason (optional)</label>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Vacation, appointment, etc."
              />
              <p className="mt-1 text-[11px] text-slate-500">
                This will also record an approved leave entry as <span className="font-medium text-slate-700">Unavailability</span> unless removed.
              </p>
            </div>
            {error ? (
              <p className="text-xs font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-white px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save unavailability
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

