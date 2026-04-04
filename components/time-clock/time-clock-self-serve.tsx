"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clockIn, clockOut } from "@/app/actions/time-clock";
import { endBreak, startBreak } from "@/app/actions/time-entry-breaks";

type Props = {
  timeClockId: string;
  locationId: string;
  viewerEmployeeId: string | null;
  /** True when the viewer’s employee row matches this clock’s location. */
  viewerAtLocation: boolean;
  /** Open punch id on this clock for the viewer, if any. */
  viewerOpenEntryId: string | null;
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
  viewerAtLocation,
  viewerOpenEntryId,
  viewerOpenBreakId = null,
  geofenceActive,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
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
        <span className="font-medium text-slate-800">Self-serve punch</span> — Your login email must
        match an active employee in Users to clock in here.
      </div>
    );
  }

  if (!viewerAtLocation) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        You’re assigned to a different store. Use the location selector in the header to choose this
        clock’s store, or ask HR to update your assignment.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">Your punch</h3>
      {geofenceActive ? (
        <p className="mt-1 text-xs text-slate-500">
          This store requires GPS for clock-in (browser will ask for location).
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Optional job code is stored on the punch for payroll rules.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-slate-600">
          Job code (optional)
          <input
            value={jobCode}
            onChange={(e) => setJobCode(e.target.value)}
            className="mt-1 block w-44 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
            placeholder="e.g. CASHIER"
            disabled={pending || Boolean(viewerOpenEntryId)}
            autoComplete="off"
          />
        </label>
        {viewerOpenEntryId ? (
          <>
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
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {pending ? "…" : "Clock in"}
          </button>
        )}
      </div>
      {msg ? <p className="mt-2 text-sm text-red-600">{msg}</p> : null}
    </div>
  );
}
