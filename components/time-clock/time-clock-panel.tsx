"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveTimeEntry, unapproveTimeEntry } from "@/app/actions/time-entry-approval";
import type { EnrichedPunchRow, TimeClockTodayMetrics } from "@/lib/time-clock/types";
import { TimeClockActiveNow } from "@/components/time-clock/time-clock-active-now";
import { TimeClockSelfServe } from "@/components/time-clock/time-clock-self-serve";
import { TimeClockTodayMetricsStrip } from "@/components/time-clock/time-clock-today-metrics";
import { TimePunchTable } from "@/components/time-clock/time-punch-table";
import type { StoreEmployeeOption } from "@/components/time-clock/time-off-request-sidebar";
import type { TimeOffRecordForUi } from "@/lib/time-clock/time-off-display";

type Props = {
  timeClockId: string;
  locationId: string;
  clockName: string;
  entries: EnrichedPunchRow[];
  /** Open punches for this clock — same source as “Clocked in now” KPI. */
  clockedInNow: EnrichedPunchRow[];
  todayMetrics?: TimeClockTodayMetrics | null;
  /** Punches for timecard drill-down (e.g. last 30 days same clock). */
  employeeTimecardPool: EnrichedPunchRow[];
  /** Approved time off overlapping loaded punches — PTO column + timecard summary. */
  timeOffRecords?: TimeOffRecordForUi[];
  /** Viewer can manage time entries (enables edits in timecard modal). */
  canManage?: boolean;
  storeEmployees?: StoreEmployeeOption[];
  /** Logged-in user’s employee id when email matches Users (self-serve punch). */
  viewerEmployeeId?: string | null;
  viewerAtLocation?: boolean;
  viewerOpenEntryId?: string | null;
  /** Phase 2: viewer has an unpaid/paid break in progress on the open punch. */
  viewerOpenBreakId?: string | null;
  geofenceActive?: boolean;
  clockSelfServeDisabled?: boolean;
};

export function TimeClockPanel({
  timeClockId,
  locationId,
  clockName,
  entries,
  clockedInNow,
  todayMetrics = null,
  employeeTimecardPool,
  timeOffRecords = [],
  canManage = false,
  storeEmployees,
  viewerEmployeeId = null,
  viewerAtLocation = false,
  viewerOpenEntryId = null,
  viewerOpenBreakId = null,
  geofenceActive = false,
  clockSelfServeDisabled = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function onApprove(entryId: string) {
    setMessage(null);
    startTransition(async () => {
      const r = await approveTimeEntry(entryId, locationId);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      refresh();
    });
  }

  function onUnapprove(entryId: string) {
    setMessage(null);
    startTransition(async () => {
      const r = await unapproveTimeEntry(entryId, locationId);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <TimeClockSelfServe
        timeClockId={timeClockId}
        locationId={locationId}
        viewerEmployeeId={viewerEmployeeId}
        viewerAtLocation={viewerAtLocation}
        viewerOpenEntryId={viewerOpenEntryId}
        viewerOpenBreakId={viewerOpenBreakId}
        geofenceActive={geofenceActive}
        disabled={clockSelfServeDisabled}
      />

      {todayMetrics ? <TimeClockTodayMetricsStrip metrics={todayMetrics} /> : null}

      {message ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          {message}
        </p>
      ) : null}

      <TimePunchTable
        rows={entries}
        title="Latest punch per employee"
        subtitle={`One row per person — most recent entry on this clock · ${clockName}`}
        emptyMessage="No punches recorded for this clock yet."
        canManage={canManage}
        pending={pending}
        showToolbar
        toolbarHint="Today"
        employeeTimecardPool={employeeTimecardPool}
        timeOffRecords={timeOffRecords}
        showReviewActions={canManage}
        onApprove={canManage ? onApprove : undefined}
        onUnapprove={canManage ? onUnapprove : undefined}
        storeEmployees={storeEmployees}
        locationId={locationId}
      />

      <TimeClockActiveNow rows={clockedInNow} />
    </div>
  );
}

export type { EnrichedPunchRow } from "@/lib/time-clock/types";
