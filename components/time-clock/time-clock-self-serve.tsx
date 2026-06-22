"use client";

import { ArrowRight, Coffee, LogIn, LogOut, MapPinOff, Pause, Play, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { clockIn, clockOut } from "@/app/actions/time-clock";
import { endBreak, startBreak } from "@/app/actions/time-entry-breaks";
import { setSelectedLocationId } from "@/app/actions/location";
import { EmployeeTimeOffRequestModal } from "@/components/time-clock/employee-time-off-request-modal";

type Props = {
  timeClockId: string;
  locationId: string;
  viewerEmployeeId: string | null;
  /** Display name from `employees.full_name` for the logged-in viewer. */
  viewerEmployeeName?: string | null;
  /** True when the viewer’s employee row matches this clock’s location. */
  viewerAtLocation: boolean;
  /** Employee's "home" store (for wrong-store recovery). */
  viewerHomeLocationId?: string | null;
  viewerHomeLocationName?: string | null;
  viewerHomeClockId?: string | null;
  /** Open punch id on this clock for the viewer, if any. */
  viewerOpenEntryId: string | null;
  /** Clock-in timestamp for the viewer's open punch (Today UX). */
  viewerOpenEntryClockInAt?: string | null;
  /** Open break id on that punch (Phase 2), if any. */
  viewerOpenBreakId?: string | null;
  /**
   * Set when the viewer's open punch is at a *different* store than this
   * portal (typically: prior store was archived after a reassignment). The
   * UI surfaces a self-heal banner explaining what's about to happen.
   */
  viewerOpenEntryForeignLocationName?: string | null;
  /** Location has geofence columns set — clock-in requires GPS. */
  geofenceActive: boolean;
  /** Connecteam-like setting: capture GPS at punch time (off / in-out / future breadcrumbs). */
  locationTrackingMode: "off" | "clock_in_out" | "breadcrumbs" | string;
  /** When true and trackingMode != off, GPS must be provided even if no geofence is set. */
  requireLocationForPunch: boolean;
  /** Extra punch dimension captured at clock-in (none / job / location). */
  categorizationMode: "none" | "job" | "location" | string;
  /** When true, employee must pick a code for the chosen categorizationMode before clock-in succeeds. */
  requireCategorization: boolean;
  jobCodes: { id: string; label: string }[];
  locationCodes: { id: string; label: string }[];
  breaksEnabled?: boolean;
  /**
   * Manager setting from `time_clocks.allow_paid_breaks`. The employee widget
   * intentionally ignores this — staff just hit "Start Break" and payroll
   * decides paid vs unpaid from duration later. Kept on the props so existing
   * callers don't break.
   */
  allowPaidBreaks?: boolean;
  /** Archived clock — hide widget. */
  disabled?: boolean;
  /** Hub dashboard: no outer card chrome, status header, or duplicate time-off CTA. */
  embedded?: boolean;
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
  viewerHomeLocationId = null,
  viewerHomeLocationName = null,
  viewerHomeClockId = null,
  viewerOpenEntryId,
  viewerOpenEntryClockInAt = null,
  viewerOpenBreakId = null,
  viewerOpenEntryForeignLocationName = null,
  geofenceActive,
  locationTrackingMode,
  requireLocationForPunch,
  categorizationMode,
  requireCategorization,
  jobCodes,
  locationCodes,
  breaksEnabled = true,
  allowPaidBreaks: _allowPaidBreaks = true,
  disabled = false,
  embedded = false,
}: Props) {
  void _allowPaidBreaks;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [timeOffOpen, setTimeOffOpen] = useState(false);
  const [jobCodeId, setJobCodeId] = useState("");
  const [locationCodeId, setLocationCodeId] = useState("");
  // Two-step "arm-then-confirm" guards against an accidental clock-out
  // (the costliest mis-tap on a busy shift). We keep the arm step but no
  // longer require a drag gesture — a second deliberate tap is enough.
  const [clockOutArmed, setClockOutArmed] = useState(false);

  const trackingOn = useMemo(
    () => locationTrackingMode === "clock_in_out" || locationTrackingMode === "breadcrumbs",
    [locationTrackingMode],
  );
  const gpsRequired = geofenceActive || trackingOn || requireLocationForPunch;

  useEffect(() => {
    // Reset the arm state whenever the open entry changes (clock-in / out)
    // so the next session always starts from a clean "Tap to arm" prompt.
    setClockOutArmed(false);
  }, [viewerOpenEntryId]);

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
    startTransition(async () => {
      if (!viewerEmployeeId || !viewerAtLocation) return;
      let clockInLat: number | undefined;
      let clockInLng: number | undefined;
      if (gpsRequired) {
        const pos = await getPosition();
        if (!pos) {
          toast.error("Location access is required to clock in at this store.");
          return;
        } else {
          clockInLat = pos.lat;
          clockInLng = pos.lng;
        }
      }
      const clientRequestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const cm = categorizationMode;
      const needsCode = requireCategorization && (cm === "job" || cm === "location");
      if (needsCode) {
        if (cm === "job" && !jobCodeId) {
          toast.error("Pick a job before clocking in.");
          return;
        }
        if (cm === "location" && !locationCodeId) {
          toast.error("Pick a location before clocking in.");
          return;
        }
      }

      const r = await clockIn({
        employeeId: viewerEmployeeId,
        locationId,
        timeClockId,
        punchSource: resolvePunchSource(),
        clientRequestId,
        clockInLat,
        clockInLng,
        jobCodeId: categorizationMode === "job" && jobCodeId ? jobCodeId : undefined,
        locationCodeId: categorizationMode === "location" && locationCodeId ? locationCodeId : undefined,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setJobCodeId("");
      setLocationCodeId("");
      const stamp = new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      toast.success(`Clocked in at ${stamp}`);
      router.refresh();
    });
  }

  function onClockOut() {
    if (!viewerOpenEntryId) return;
    startTransition(async () => {
      let clockOutLat: number | undefined;
      let clockOutLng: number | undefined;
      if (gpsRequired) {
        const pos = await getPosition();
        if (!pos) {
          toast.error("Location access is required to clock out at this store.");
          return;
        } else {
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
        toast.error(r.error);
        return;
      }
      setClockOutArmed(false);
      const stamp = new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      toast.success(`Clocked out at ${stamp}`);
      router.refresh();
    });
  }

  function onStartBreak() {
    if (!viewerOpenEntryId) return;
    startTransition(async () => {
      // No paid/unpaid choice from the employee — payroll classifies later
      // based on break duration vs. the location's policy.
      const r = await startBreak({
        timeEntryId: viewerOpenEntryId,
        locationId,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Break started");
      router.refresh();
    });
  }

  function onEndBreak() {
    if (!viewerOpenBreakId) return;
    startTransition(async () => {
      const r = await endBreak({ breakId: viewerOpenBreakId, locationId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Break ended");
      router.refresh();
    });
  }

  if (disabled) return null;

  if (!viewerEmployeeId) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
            <UserX className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Self-serve</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Account not linked</p>
            <p className="mt-1 text-sm text-slate-600">
              Ask HR to link your login email to your employee profile.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!viewerAtLocation) {
    const canAutoGo = Boolean(viewerHomeLocationId) && Boolean(viewerHomeLocationName);
    const who =
      viewerEmployeeName && viewerEmployeeName.trim().length > 0
        ? viewerEmployeeName.trim()
        : "You";
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-amber-200 bg-white p-2 text-amber-900">
            <MapPinOff className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800/80">Self-serve</p>
            <p className="mt-1 text-sm font-semibold text-amber-950">{who}</p>
            <p className="mt-1 text-sm text-amber-900">
              This clock is for a different store than your home assignment. Ask HR to update your store if
              that looks wrong.
            </p>
          </div>
          </div>
          {canAutoGo ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await setSelectedLocationId(viewerHomeLocationId!);
                  router.push(
                    viewerHomeClockId
                      ? `/time-clock/${viewerHomeClockId}`
                      : "/time-clock",
                  );
                  router.refresh();
                });
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-bold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-60"
              aria-label={`Go to ${viewerHomeLocationName}`}
              title={`Go to ${viewerHomeLocationName}`}
            >
              {viewerHomeLocationName}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </section>
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

  const isClockedIn = Boolean(viewerOpenEntryId);
  const isOnBreak = Boolean(viewerOpenEntryId && viewerOpenBreakId);
  const needsCode = !isClockedIn && requireCategorization && (categorizationMode === "job" || categorizationMode === "location");
  const readyForClockIn =
    !needsCode ||
    (categorizationMode === "job" ? Boolean(jobCodeId) : Boolean(locationCodeId));

  const blockBase =
    "group relative overflow-hidden rounded-2xl p-5 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60";
  const blockInner = "flex items-center justify-between gap-4";
  const blockTitle = "text-xl font-black tracking-tight";
  const blockHint = "mt-1 text-xs font-semibold uppercase tracking-wide opacity-85";

  const shellClass = embedded
    ? ""
    : "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm";

  const codePicker =
    !isClockedIn && categorizationMode !== "none" ? (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {categorizationMode === "job" ? "Job" : "Location"}
            {requireCategorization ? " · Required" : ""}
          </p>
          <p className="text-xs text-slate-500">
            {categorizationMode === "job" ? "Payroll coding" : "Costing tag"}
          </p>
        </div>
        <div className="mt-3 max-w-sm">
          {categorizationMode === "job" ? (
            <select
              value={jobCodeId}
              onChange={(e) => setJobCodeId(e.target.value)}
              disabled={pending}
              className="h-12 w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/15 disabled:opacity-60"
              aria-label="Pick job"
            >
              <option value="">Select…</option>
              {jobCodes.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={locationCodeId}
              onChange={(e) => setLocationCodeId(e.target.value)}
              disabled={pending}
              className="h-12 w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/15 disabled:opacity-60"
              aria-label="Pick location code"
            >
              <option value="">Select…</option>
              {locationCodes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    ) : null;

  const punchGrid = (
    <div className="grid gap-3 sm:grid-cols-2">
        {/* CLOCK IN — vibrant emerald gradient (semantic green for "go"). */}
        {!isClockedIn ? (
          <button
            type="button"
            disabled={pending || !readyForClockIn}
            onClick={onClockIn}
            className={`${blockBase} border border-emerald-400/40 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md hover:shadow-lg hover:from-emerald-500 hover:to-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/30`}
            aria-label="Clock in"
          >
            <div className={blockInner}>
              <div className="min-w-0">
                <p className={blockTitle}>In</p>
                <p className={blockHint}>{pending ? "Working…" : "Tap once"}</p>
              </div>
              <div className="rounded-2xl bg-white/15 p-3">
                <LogIn className="h-7 w-7" aria-hidden />
              </div>
            </div>
          </button>
        ) : null}

        {/* CLOCK OUT — vibrant orange→red gradient (signals "ending"). */}
        {isClockedIn ? (
          <div
            className={`${blockBase} border border-orange-400/40 bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-md focus-within:ring-4 focus-within:ring-red-500/25`}
            aria-label="Clock out"
          >
            <div className={blockInner}>
              <div className="min-w-0">
                <p className={blockTitle}>Out</p>
                <p className={blockHint}>
                  {pending
                    ? "Working…"
                    : clockOutArmed
                      ? "Tap once more to confirm"
                      : "Tap to arm"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/15 p-3">
                <LogOut className="h-7 w-7" aria-hidden />
              </div>
            </div>

            {!clockOutArmed ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setClockOutArmed(true)}
                className="mt-4 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold tracking-tight text-white hover:bg-white/15 disabled:opacity-60"
              >
                Confirm
              </button>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setClockOutArmed(false)}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={onClockOut}
                  className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-red-700 shadow-sm hover:bg-white/90 disabled:opacity-60"
                  aria-label="Tap to confirm clock out"
                >
                  Tap to confirm
                </button>
              </div>
            )}
          </div>
        ) : null}

        {/* BREAK — single amber button that toggles Start ⇄ End. */}
        {isClockedIn && breaksEnabled ? (
          <button
            type="button"
            disabled={pending}
            onClick={isOnBreak ? onEndBreak : onStartBreak}
            className={`${blockBase} border border-amber-300 bg-amber-500 text-amber-950 hover:bg-amber-600 focus:outline-none focus:ring-4 focus:ring-amber-400/30`}
            aria-label={isOnBreak ? "End break" : "Start break"}
          >
            <div className={blockInner}>
              <div className="min-w-0">
                <p className={blockTitle}>{isOnBreak ? "End Break" : "Start Break"}</p>
                <p className={blockHint}>
                  {pending ? "Working…" : isOnBreak ? "Back to work" : "Step away"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/35 p-3">
                {isOnBreak ? (
                  <Play className="h-7 w-7" aria-hidden />
                ) : (
                  <Coffee className="h-7 w-7" aria-hidden />
                )}
              </div>
            </div>
          </button>
        ) : null}
    </div>
  );

  const body = (
    <>
      {!embedded ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="mt-1 text-xs text-slate-500">
              {gpsRequired ? "GPS required for this clock." : "GPS optional."}
            </p>
          </div>
          {isClockedIn ? (
            <div
              className={`rounded-xl border px-4 py-2 ${
                isOnBreak
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-emerald-200 bg-emerald-50 text-emerald-950"
              }`}
              role="status"
              aria-live="polite"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                {isOnBreak ? "On break" : "Clocked in"}
              </p>
              <p className="mt-1 font-mono text-sm font-bold tabular-nums">
                {clockInTimeLabel ? `Since ${clockInTimeLabel}` : "—"}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Status
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900">Clocked out</p>
            </div>
          )}
        </div>
      ) : null}

      {isClockedIn && viewerOpenEntryForeignLocationName ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          role="status"
        >
          You&rsquo;re still clocked in at{" "}
          <span className="font-semibold">{viewerOpenEntryForeignLocationName}</span>. Tap{" "}
          <span className="font-semibold">Out</span> below to clock out — then you can clock in here.
        </div>
      ) : null}

      {codePicker ? <div className={embedded ? "" : "mt-4"}>{codePicker}</div> : null}

      <div className={embedded ? "" : "mt-5"}>{punchGrid}</div>

      {!embedded ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setTimeOffOpen(true)}
            disabled={pending}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Pause className="h-4 w-4 text-orange-700" aria-hidden />
            Time off
          </button>
        </div>
      ) : null}

      {!embedded ? (
        <EmployeeTimeOffRequestModal
          open={timeOffOpen}
          onClose={() => setTimeOffOpen(false)}
          locationId={locationId}
          employeeId={viewerEmployeeId}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }

  return <section className={shellClass}>{body}</section>;
}
