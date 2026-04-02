"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clockOut } from "@/app/actions/time-clock";
import type { EnrichedPunchRow, TimeClockTodayMetrics } from "@/lib/time-clock/types";
import { TimeClockTodayMetricsStrip } from "@/components/time-clock/time-clock-today-metrics";
import { TimePunchTable } from "@/components/time-clock/time-punch-table";

type Props = {
  locationId: string;
  clockName: string;
  entries: EnrichedPunchRow[];
  todayMetrics?: TimeClockTodayMetrics | null;
  /** Punches for timecard drill-down (e.g. last 30 days same clock). */
  employeeTimecardPool: EnrichedPunchRow[];
  /** Viewer can manage time entries (enables edits in timecard modal). */
  canManage?: boolean;
};

export function TimeClockPanel({
  locationId,
  clockName,
  entries,
  todayMetrics = null,
  employeeTimecardPool,
  canManage = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    router.refresh();
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

  return (
    <div className="space-y-6">
      {todayMetrics ? <TimeClockTodayMetricsStrip metrics={todayMetrics} /> : null}

      {message ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          {message}
        </p>
      ) : null}

      <TimePunchTable
        rows={entries}
        title="Recent punches"
        subtitle={`Last 50 entries for this time clock · ${clockName}`}
        emptyMessage="No punches recorded for this clock yet."
        canManage={canManage}
        showClockOutActions
        onClockOut={onClockOut}
        pending={pending}
        showToolbar
        toolbarHint="Today"
        employeeTimecardPool={employeeTimecardPool}
      />
    </div>
  );
}

export type { EnrichedPunchRow } from "@/lib/time-clock/types";
