"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clockIn, clockOut } from "@/app/actions/time-clock";
import { endBreak, startBreak } from "@/app/actions/time-entry-breaks";
import { EmployeeTimeOffRequestModal } from "@/components/time-clock/employee-time-off-request-modal";

type Props = {
  timeClockId: string;
  locationId: string;
  viewerEmployeeId: string | null;
  /** Display name from `employees.full_name` for the logged-in viewer. */
  viewerEmployeeName?: string | null;
  /** True when the viewer’s employee row matches this clock’s location. */
  viewerAtLocation: boolean;
  /** Open punch id on this clock for the viewer, if any. */
  viewerOpenEntryId: string | null;
  /** Clock-in timestamp for the viewer's open punch (Today UX). */
  viewerOpenEntryClockInAt?: string | null;
  /** Open break id on that punch (Phase 2), if any. */
  viewerOpenBreakId?: string | null;
  /** Location has geofence columns set — clock-in requires GPS. */
  geofenceActive: boolean;
  /** Archived clock — hide widget. */
  disabled?: boolean;
};

function resolvePunchSource(): "mobile" | "web" {
  if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
    return "mobile";
  }
  return "web";
}

export function TimeClockSelfServe({
  timeClockId,
  locationId,
  viewerEmployeeId,
  viewerEmployeeName = null,
  viewerAtLocation,
  viewerOpenEntryId,
  viewerOpenEntryClockInAt = null,
  viewerOpenBreakId = null,
  geofenceActive,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [timeOffOpen, setTimeOffOpen] = useState(false);
  const [jobCode, setJobCode] = useState("");
  const [breakPaid, setBreakPaid] = useState(false);

  function getPosition(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    });
  }

  function onClockIn() {
    setMsg(null);
    startTransition(async () => {
      if (!viewerEmployeeId || !viewerAtLocation) return;
      let clockInLat: number | undefined;
      let clockInLng: number | undefined;
      if (geofenceActive) {
        const pos = await getPosition();
        if (!pos) {
          setMsg("Location access is required to clock in at this store.");
          return;
        }
        clockInLat = pos.lat;
        clockInLng = pos.lng;
      }
      const clientRequestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const jc = jobCode.trim();
      const r = await clockIn({
        employeeId: viewerEmployeeId,
        locationId,
        timeClockId,
        punchSource: resolvePunchSource(),
        clientRequestId,
        clockInLat,
        clockInLng,
        jobCode: jc.length > 0 ? jc : undefined,
      });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setJobCode("");
      router.refresh();
    });
  }

  function onClockOut() {
    if (!viewerOpenEntryId) return;
    setMsg(null);
    startTransition(async () => {
      let clockOutLat: number | undefined;
      let clockOutLng: number | undefined;
      if (geofenceActive) {
        const pos = await getPosition();
        if (pos) {
          clockOutLat = pos.lat;
          clockOutLng = pos.lng;
        }
      }
      const r = await clockOut({
        entryId: viewerOpenEntryId,
        locationId,
        clockOutLat,
        clockOutLng,
      });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onStartBreak() {
    if (!viewerOpenEntryId) return;
    setMsg(null);
    startTransition(async () => {
      const r = await startBreak({
        timeEntryId: viewerOpenEntryId,
        locationId,
        isPaid: breakPaid,
      });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onEndBreak() {
    if (!viewerOpenBreakId) return;
    setMsg(null);
    startTransition(async () => {
      const r = await endBreak({ breakId: viewerOpenBreakId, locationId });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (disabled) return null;

  if (!viewerEmployeeId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span className="font-medium text-slate-800">Self-serve clock in</span> — Your login email must
        match an active employee in Users to clock in here.
      </div>
    );
  }

  if (!viewerAtLocation) {
    const who =
      viewerEmployeeName && viewerEmployeeName.trim().length > 0
        ? viewerEmployeeName.trim()
        : "You";
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span className="font-medium text-amber-950">{who}</span> — You’re assigned to a different store.
        Use the location selector in the header to choose this clock’s store, or ask HR to update your
        assignment.
      </div>
    );
  }

  const displayName =
    viewerEmployeeName && viewerEmployeeName.trim().length > 0
      ? viewerEmployeeName.trim()
      : "Employee";

  const clockInTimeLabel =
    viewerOpenEntryClockInAt != null && viewerOpenEntryClockInAt !== ""
      ? new Date(viewerOpenEntryClockInAt).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">Your time today</h3>
      <p className="mt-1 text-sm text-slate-700">
        Clocking in as <span className="font-semibold text-slate-900">{displayName}</span>
      </p>
      {geofenceActive ? (
        <p className="mt-1 text-xs text-slate-500">
          This store requires GPS for clock-in (browser will ask for location).
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Punch in/out is saved to the time clock with a timestamp. Optional job code is for payroll
          coding only.
        </p>
      )}
      {!viewerOpenEntryId ? (
        <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            Optional job code (payroll)
          </summary>
          <label className="mt-2 block text-xs font-medium text-slate-600">
            Job code
            <input
              value={jobCode}
              onChange={(e) => setJobCode(e.target.value)}
              className="mt-1 block w-full max-w-xs rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
              placeholder="e.g. CASHIER"
              disabled={pending}
              autoComplete="off"
            />
          </label>
        </details>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {viewerOpenEntryId ? (
          <>
            <div
              className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
              role="status"
              aria-live="polite"
            >
              Clocked in
              {clockInTimeLabel ? (
                <span className="ml-2 tabular-nums font-medium text-emerald-100">
                  since {clockInTimeLabel}
                </span>
              ) : null}
            </div>
            {viewerOpenBreakId ? (
              <button
                type="button"
                disabled={pending}
                onClick={onEndBreak}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              >
                {pending ? "…" : "End break"}
              </button>
            ) : (
              <>
                <label className="block text-xs font-medium text-slate-600">
                  Break type
                  <select
                    value={breakPaid ? "paid" : "unpaid"}
                    onChange={(e) => setBreakPaid(e.target.value === "paid")}
                    disabled={pending}
                    className="mt-1 block rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                  >
                    <option value="unpaid">Unpaid (meal / rest)</option>
                    <option value="paid">Paid break</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={pending}
                  onClick={onStartBreak}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {pending ? "…" : "Start break"}
                </button>
              </>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={onClockOut}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {pending ? "…" : "Clock out"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={onClockIn}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "…" : "Clock in"}
          </button>
        )}
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setTimeOffOpen(true)}
          disabled={pending}
          aria-haspopup="dialog"
          className="text-sm font-medium text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-900 disabled:opacity-50"
        >
          Request time off
        </button>
      </div>
      {msg ? <p className="mt-2 text-sm text-red-600">{msg}</p> : null}
      <EmployeeTimeOffRequestModal
        open={timeOffOpen}
        onClose={() => setTimeOffOpen(false)}
        locationId={locationId}
        employeeId={viewerEmployeeId}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
