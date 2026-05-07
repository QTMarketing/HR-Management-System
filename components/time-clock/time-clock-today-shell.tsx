"use client";

import { useMemo } from "react";
import { TimeClockSelfServe } from "@/components/time-clock/time-clock-self-serve";
import { TimePunchTable } from "@/components/time-clock/time-punch-table";
import type { StoreEmployeeOption } from "@/components/time-clock/time-off-request-sidebar";
import type { TimeOffRecordForUi } from "@/lib/time-clock/time-off-display";
import type { PendingTimeOffRequestRow } from "@/lib/time-clock/pending-time-off";
import type { EnrichedPunchRow, TimeClockTodayMetrics } from "@/lib/time-clock/types";

function fmtHm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h}:${mm}`;
}

function minutesBetween(startIso: string, endIso: string): number | null {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

function sameLocalDay(aIso: string, day: Date): boolean {
  const d = new Date(aIso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

type Props = {
  timeClockId: string;
  locationId: string;
  clockName: string;
  geofenceActive: boolean;
  locationTrackingMode: "off" | "clock_in_out" | "breadcrumbs" | string;
  requireLocationForPunch: boolean;
  categorizationMode: "none" | "job" | "location" | string;
  requireCategorization: boolean;
  jobCodes: { id: string; label: string; colorToken?: string }[];
  locationCodes: { id: string; label: string; colorToken?: string }[];
  breaksEnabled: boolean;
  allowPaidBreaks: boolean;
  clockSelfServeDisabled: boolean;

  viewerEmployeeId: string | null;
  viewerEmployeeName: string | null;
  viewerAtLocation: boolean;
  viewerHomeLocationId: string | null;
  viewerHomeLocationName: string | null;
  viewerHomeClockId: string | null;
  viewerOpenEntryId: string | null;
  viewerOpenEntryClockInAt: string | null;
  viewerOpenBreakId: string | null;

  todayMetrics: TimeClockTodayMetrics | null;
  latestRows: EnrichedPunchRow[];
  /** Pool for timecard drill-down (e.g. last 90 days). */
  employeeTimecardPool: EnrichedPunchRow[];
  /** Approved time off overlapping loaded punches (PTO column + timecard summary). */
  timeOffRecords: TimeOffRecordForUi[];
  /** Employee-submitted time off awaiting manager action (manager scope). */
  pendingTimeOffRequests: PendingTimeOffRequestRow[];
  /** Managers: enable approvals and time edits in the timecard modal. */
  canManage: boolean;
  /** Same-store roster for time off drawer (timecard modal). */
  storeEmployees: StoreEmployeeOption[];
};

export function TimeClockTodayShell(props: Props) {
  const today = useMemo(() => new Date(), []);

  const viewerRow = useMemo(() => {
    if (!props.viewerEmployeeId) return null;
    const hit = props.latestRows.find((r) => r.employeeId === props.viewerEmployeeId);
    return hit ?? null;
  }, [props.latestRows, props.viewerEmployeeId]);

  const status = useMemo(() => {
    if (props.clockSelfServeDisabled) {
      return { label: "Clock is archived", tone: "neutral" as const, hint: "New clock-ins are disabled." };
    }
    if (!props.viewerEmployeeId) {
      return { label: "Not linked", tone: "neutral" as const, hint: "Ask HR to link your login to your employee profile." };
    }
    if (!props.viewerAtLocation) {
      return { label: "Wrong store", tone: "warn" as const, hint: "Switch to the correct store to use this clock." };
    }
    if (props.viewerOpenEntryId && props.viewerOpenBreakId) {
      return { label: "On break", tone: "break" as const, hint: "End break when you’re back." };
    }
    if (props.viewerOpenEntryId) {
      return { label: "Currently clocked in", tone: "in" as const, hint: "Clock out when you’re done." };
    }
    return { label: "Currently clocked out", tone: "out" as const, hint: "Clock in to start your shift." };
  }, [
    props.clockSelfServeDisabled,
    props.viewerEmployeeId,
    props.viewerAtLocation,
    props.viewerOpenEntryId,
    props.viewerOpenBreakId,
  ]);

  const statusStyles =
    status.tone === "in"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : status.tone === "out"
        ? "border-slate-200 bg-white text-slate-900"
        : status.tone === "break"
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : status.tone === "warn"
            ? "border-orange-200 bg-orange-50 text-orange-950"
            : "border-slate-200 bg-slate-50 text-slate-800";

  // Bottom: "Today" summary for the viewer (simple + robust).
  const todayWorkedMinutes = useMemo(() => {
    if (!viewerRow) return null;
    if (!viewerRow.hasRealTimeEntry) return null;
    if (!sameLocalDay(viewerRow.clockInAt, today)) return null;
    if (viewerRow.status === "open" || !viewerRow.clockOutAt) {
      const m = minutesBetween(viewerRow.clockInAt, new Date().toISOString());
      return m;
    }
    return viewerRow.workedMinutes ?? minutesBetween(viewerRow.clockInAt, viewerRow.clockOutAt);
  }, [today, viewerRow]);

  const recent = useMemo(() => {
    const rows = props.latestRows
      .filter((r) => r.hasRealTimeEntry !== false)
      .slice()
      .sort((a, b) => b.clockInAt.localeCompare(a.clockInAt))
      .slice(0, 6);
    return rows;
  }, [props.latestRows]);

  return (
    <div className="space-y-5">
      <section className={`rounded-2xl border p-6 shadow-sm ${statusStyles}`}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Current status</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-3xl font-black tracking-tight">{status.label}</h2>
            <p className="mt-1 text-sm opacity-80">{status.hint}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Today (you)
            </p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900">
              {todayWorkedMinutes == null ? "—" : fmtHm(todayWorkedMinutes)}
            </p>
          </div>
        </div>
      </section>

      {/* Middle: action cluster (self-serve) — this component already hides illogical actions. */}
      <TimeClockSelfServe
        timeClockId={props.timeClockId}
        locationId={props.locationId}
        viewerEmployeeId={props.viewerEmployeeId}
        viewerEmployeeName={props.viewerEmployeeName}
        viewerAtLocation={props.viewerAtLocation}
        viewerHomeLocationId={props.viewerHomeLocationId}
        viewerHomeLocationName={props.viewerHomeLocationName}
        viewerHomeClockId={props.viewerHomeClockId}
        viewerOpenEntryId={props.viewerOpenEntryId}
        viewerOpenEntryClockInAt={props.viewerOpenEntryClockInAt}
        viewerOpenBreakId={props.viewerOpenBreakId}
        geofenceActive={props.geofenceActive}
        locationTrackingMode={props.locationTrackingMode}
        requireLocationForPunch={props.requireLocationForPunch}
        categorizationMode={props.categorizationMode}
        requireCategorization={props.requireCategorization}
        jobCodes={props.jobCodes}
        locationCodes={props.locationCodes}
        breaksEnabled={props.breaksEnabled}
        allowPaidBreaks={props.allowPaidBreaks}
        disabled={props.clockSelfServeDisabled}
      />

      {/* Bottom: clean summary + recent activity */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Today</h3>
            <p className="mt-1 text-xs text-slate-500">
              Quick summary for this clock.
            </p>
          </div>
          {props.todayMetrics ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Scheduled", props.todayMetrics.scheduledToday],
                ["Late in", props.todayMetrics.lateClockIns],
                ["Clocked in", props.todayMetrics.clockedInNow],
                ["Attendance", props.todayMetrics.totalAttendance],
                ["Running late", props.todayMetrics.runningLate],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                    {String(value)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent activity
          </p>
          {recent.length ? (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.employeeName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {r.clockInDisplay}
                      {r.clockOutAt ? ` → ${r.clockOutDisplay}` : " → (open)"}
                      {r.breaksSummaryLabel ? ` · ${r.breaksSummaryLabel}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {r.reviewLabel}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No recent punches yet.</p>
          )}
        </div>
      </section>

      {/* Connecteam-style roster grid (employee list) */}
      <TimePunchTable
        rows={props.latestRows}
        title="Team"
        subtitle="One row per team member — latest punch on this clock"
        emptyMessage="No employees to show."
        timeClockId={props.timeClockId}
        canManage={props.canManage}
        pending={false}
        showToolbar
        toolbarHint="Today"
        employeeTimecardPool={props.employeeTimecardPool}
        timeOffRecords={props.timeOffRecords}
        pendingTimeOffRequests={props.pendingTimeOffRequests}
        viewerEmployeeId={props.viewerEmployeeId}
        showReviewActions={props.canManage}
        storeEmployees={props.storeEmployees}
        locationId={props.locationId}
      />
    </div>
  );
}

