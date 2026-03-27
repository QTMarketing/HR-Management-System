"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { clockIn, clockOut } from "@/app/actions/time-clock";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";
import { setSelectedTimeClockId } from "@/app/actions/time-clock-scope";
import type { EnrichedPunchRow, TimeClockTodayMetrics } from "@/lib/time-clock/types";
import { TimeClockTodayMetricsStrip } from "@/components/time-clock/time-clock-today-metrics";
import { TimePunchTable } from "@/components/time-clock/time-punch-table";

type EmployeeOption = { id: string; full_name: string };

type ClockOption = { id: string; name: string };

type Props = {
  locationId: string;
  locationName: string;
  timeClockId: string;
  timeClocks: ClockOption[];
  employees: EmployeeOption[];
  entries: EnrichedPunchRow[];
  todayMetrics?: TimeClockTodayMetrics | null;
  /** Archived clocks: hide new clock-ins (Connecteam-style). */
  archivedReadOnly?: boolean;
  smartGroupHint?: string | null;
};

export function TimeClockPanel({
  locationId,
  locationName,
  timeClockId,
  timeClocks,
  employees,
  entries,
  todayMetrics,
  archivedReadOnly = false,
  smartGroupHint = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(employees[0]?.id ?? "");
  const [clockId, setClockId] = useState(timeClockId);

  const employeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  useEffect(() => {
    setClockId(timeClockId);
  }, [timeClockId]);

  useEffect(() => {
    if (!selectedId || !employeeIds.has(selectedId)) {
      setSelectedId(employees[0]?.id ?? "");
    }
  }, [employeeIds, employees, selectedId]);

  function refresh() {
    router.refresh();
  }

  function onClockIn() {
    if (archivedReadOnly) {
      setMessage("This clock is archived — turn it back to active in the database to allow new punches.");
      return;
    }
    if (!selectedId) {
      setMessage("Select an employee.");
      return;
    }
    if (!clockId) {
      setMessage("No time clock for this store — run database migration 007.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const r = await clockIn(selectedId, locationId, clockId);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      refresh();
    });
  }

  function onClockOut(entryId: string) {
    setMessage(null);
    startTransition(async () => {
      const r = await clockOut(entryId, locationId);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      refresh();
    });
  }

  function onClockChange(id: string) {
    setClockId(id);
    startTransition(async () => {
      await setSelectedTimeClockId(id);
      refresh();
    });
  }

  const clockLabel = timeClocks.find((c) => c.id === clockId)?.name ?? "";

  return (
    <div className="space-y-6">
      {todayMetrics && !archivedReadOnly ? (
        <TimeClockTodayMetricsStrip metrics={todayMetrics} />
      ) : null}

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Clock in / out</h2>
        <p className="mt-1 text-xs text-slate-500">{locationName}</p>
        {smartGroupHint ? (
          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
              smartGroupHint.startsWith("Could not load")
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
            role="status"
          >
            {smartGroupHint}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-3">
          {timeClocks.length > 1 ? (
            <label className="flex max-w-md flex-col gap-1 text-xs font-medium text-slate-600">
              Time clock
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                value={clockId}
                onChange={(e) => onClockChange(e.target.value)}
                disabled={pending}
              >
                {timeClocks.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
              Employee
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={pending || employees.length === 0}
              >
                {employees.length === 0 ? (
                  <option value="">
                    {smartGroupHint && !smartGroupHint.startsWith("Could not load")
                      ? "No eligible employees for this clock"
                      : "No employees at this location"}
                  </option>
                ) : (
                  employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              onClick={onClockIn}
              disabled={pending || !selectedId || !clockId || archivedReadOnly}
              className={`${PRIMARY_ORANGE_CTA} px-4 py-2 text-sm font-medium disabled:opacity-50`}
            >
              {pending ? "Working…" : archivedReadOnly ? "Archived" : "Clock in"}
            </button>
          </div>
        </div>
        {message ? (
          <p className="mt-3 text-sm text-amber-800" role="status">
            {message}
          </p>
        ) : null}
      </div>

      <TimePunchTable
        rows={entries}
        title="Recent punches"
        subtitle={`Last 50 entries for the selected time clock${clockLabel ? ` · ${clockLabel}` : ""}`}
        emptyMessage="No time entries yet. Clock in above, or run migrations 006–007."
        showClockOutActions
        onClockOut={onClockOut}
        pending={pending}
        showToolbar
        toolbarHint="Today"
      />
    </div>
  );
}

export type { EnrichedPunchRow } from "@/lib/time-clock/types";
