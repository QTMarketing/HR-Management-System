"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Search } from "lucide-react";
import { bulkApplyTimeClockTimesheetPeriod, saveTimeClockTimesheetPeriod } from "@/app/actions/time-clock-period";
import { setTimeClockAssignment } from "@/app/actions/smart-groups";
import { saveTimeClockTrackingAndCategorization } from "@/app/actions/time-clock-setup";
import type { TimesheetPeriodConfig, TimesheetPeriodKind } from "@/lib/time-clock/timesheet-period";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

const SETUP_STEPS = [
  { id: 1, label: "Payroll" },
  { id: 2, label: "Location" },
  { id: 3, label: "Access" },
] as const;

type Props = {
  timeClockId: string;
  initialKind: TimesheetPeriodKind;
  initialConfig: TimesheetPeriodConfig;
  canEdit: boolean;
  /** Store this clock belongs to (for links to geofence / store settings). */
  storeLocationId?: string | null;
  smartGroupsForClock?: { id: string; label: string; assigned: boolean }[];
  canManageSmartGroups?: boolean;
  clocksForBulkApply?: { id: string; label: string }[];
  initialLocationTrackingMode: "off" | "clock_in_out" | "breadcrumbs";
  initialRequireLocationForPunch: boolean;
  initialCategorizationMode: "none" | "job" | "location";
  initialRequireCategorization: boolean;
  jobCodes: { id: string; label: string; colorToken?: string }[];
  locationCodes: { id: string; label: string; colorToken?: string }[];
};

export function TimeClockSettingsForm({
  timeClockId,
  initialKind,
  initialConfig,
  canEdit,
  storeLocationId = null,
  smartGroupsForClock = [],
  canManageSmartGroups = false,
  clocksForBulkApply = [],
  initialLocationTrackingMode,
  initialRequireLocationForPunch,
  initialCategorizationMode,
  initialRequireCategorization,
  jobCodes,
  locationCodes,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<TimesheetPeriodKind>(initialKind);
  const [weekStartsOn, setWeekStartsOn] = useState<number>(() => {
    const v = initialConfig.week_starts_on;
    return typeof v === "number" && v >= 0 && v <= 6 ? v : 1;
  });
  const [monthlyEndsOn, setMonthlyEndsOn] = useState<26 | 27 | 28 | 29 | 30 | "last_day">(() => {
    const v = initialConfig.monthly_ends_on;
    return v === "last_day" || v === 26 || v === 27 || v === 28 || v === 29 || v === 30
      ? v
      : "last_day";
  });
  const [splitDay, setSplitDay] = useState(
    String(initialConfig.split_after_day ?? 15),
  );
  const [payrollSoftware, setPayrollSoftware] = useState(initialConfig.payroll_software ?? "");
  const [payrollHandled, setPayrollHandled] = useState(initialConfig.payroll_handled ?? "");
  const [payrollOwner, setPayrollOwner] = useState(initialConfig.payroll_owner ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Step 2 — Location tracking
  const [trackingMode, setTrackingMode] = useState<
    "off" | "clock_in_out" | "breadcrumbs"
  >(initialLocationTrackingMode);
  const [requireLocation, setRequireLocation] = useState<boolean>(
    initialRequireLocationForPunch,
  );

  // Step 3 — Categorization
  const [catMode, setCatMode] = useState<"none" | "job" | "location">(
    initialCategorizationMode,
  );
  const [requireCat, setRequireCat] = useState<boolean>(initialRequireCategorization);

  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [asgBusy, setAsgBusy] = useState(false);
  const [asgError, setAsgError] = useState<string | null>(null);
  const [asgQuery, setAsgQuery] = useState("");
  const [asgOn, setAsgOn] = useState<Set<string>>(
    () => new Set(smartGroupsForClock.filter((g) => g.assigned).map((g) => g.id)),
  );

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkQuery, setBulkQuery] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());

  const filteredSmartGroups = useMemo(() => {
    const q = asgQuery.trim().toLowerCase();
    if (!q) return smartGroupsForClock;
    return smartGroupsForClock.filter((g) => g.label.toLowerCase().includes(q));
  }, [asgQuery, smartGroupsForClock]);

  const filteredBulkTargets = useMemo(() => {
    const q = bulkQuery.trim().toLowerCase();
    if (!q) return clocksForBulkApply;
    return clocksForBulkApply.filter((c) => c.label.toLowerCase().includes(q));
  }, [bulkQuery, clocksForBulkApply]);

  function buildConfig(): TimesheetPeriodConfig {
    const n = Number.parseInt(splitDay, 10);
    const split_after_day =
      kind === "semi_monthly" || kind === "custom"
        ? Number.isFinite(n) && n >= 1 && n <= 27
          ? n
          : 15
        : undefined;
    return {
      week_starts_on: weekStartsOn,
      monthly_ends_on: kind === "monthly" ? monthlyEndsOn : undefined,
      split_after_day,
      payroll_software: payrollSoftware || undefined,
      payroll_handled: payrollHandled || undefined,
      payroll_owner: payrollOwner || undefined,
    };
  }

  function save() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const r = await saveTimeClockTimesheetPeriod({
        timeClockId,
        timesheet_period_kind: kind,
        timesheet_period_config: buildConfig(),
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setMsg("Setup saved.");
      setStep(1);
      router.refresh();
    });
  }

  function saveAllSetup() {
    // Save payroll + tracking/categorization together at the end.
    setErr(null);
    setMsg(null);
    setSetupError(null);
    startTransition(async () => {
      const r1 = await saveTimeClockTimesheetPeriod({
        timeClockId,
        timesheet_period_kind: kind,
        timesheet_period_config: buildConfig(),
      });
      if (!r1.ok) {
        setErr(r1.error);
        return;
      }
      const r2 = await saveTimeClockTrackingAndCategorization({
        timeClockId,
        location_tracking_mode: trackingMode,
        require_location_for_punch: requireLocation,
        categorization_mode: catMode,
        require_categorization: requireCat,
      });
      if (!r2.ok) {
        setSetupError(r2.error);
        return;
      }
      setMsg("Setup saved.");
      setStep(1);
      router.refresh();
    });
  }

  function toggleSmartGroup(groupId: string, on: boolean) {
    if (!canManageSmartGroups) return;
    setAsgError(null);
    setAsgBusy(true);
    void (async () => {
      const r = await setTimeClockAssignment(groupId, timeClockId, on);
      setAsgBusy(false);
      if (!r.ok) {
        setAsgError(r.error);
        return;
      }
      setAsgOn((prev) => {
        const next = new Set(prev);
        if (on) next.add(groupId);
        else next.delete(groupId);
        return next;
      });
      router.refresh();
    })();
  }

  function runBulkApply() {
    setBulkErr(null);
    const ids = [...bulkSelected];
    if (ids.length === 0) {
      setBulkErr("Select at least one time clock.");
      return;
    }
    setBulkBusy(true);
    void (async () => {
      const r = await bulkApplyTimeClockTimesheetPeriod({
        timeClockIds: ids,
        timesheet_period_kind: kind,
        timesheet_period_config: buildConfig(),
      });
      setBulkBusy(false);
      if (!r.ok) {
        setBulkErr(r.error);
        return;
      }
      setBulkOpen(false);
      setBulkSelected(new Set());
      setMsg(`Applied to ${ids.length} time clock${ids.length === 1 ? "" : "s"}.`);
      router.refresh();
    })();
  }

  function saveTrackingAndCategorization() {
    setSetupError(null);
    setSetupBusy(true);
    void (async () => {
      const r = await saveTimeClockTrackingAndCategorization({
        timeClockId,
        location_tracking_mode: trackingMode,
        require_location_for_punch: requireLocation,
        categorization_mode: catMode,
        require_categorization: requireCat,
      });
      setSetupBusy(false);
      if (!r.ok) {
        setSetupError(r.error);
        return;
      }
      setMsg("Setup saved.");
      router.refresh();
    })();
  }

  return (
    <section className="relative -mx-4 bg-slate-50 px-4 py-8 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Setup
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Configure Payroll &amp; Time Tracking
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            Set your operational rules for pay periods, workweeks, and integrations.
          </p>
        </header>

        {!canEdit ? (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <p className="text-sm text-slate-600">
              You don’t have permission to modify these settings.
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <div aria-label="Setup progress" className="border-t border-gray-100 pt-6">
              <div className="grid grid-cols-3 gap-4">
                {SETUP_STEPS.map((s) => {
                  const active = step === s.id;
                  const done = step > s.id;
                  return (
                    <div key={s.id} className="min-w-0">
                      <div
                        className={`h-0.5 w-full rounded-full ${
                          active ? "bg-orange-600" : done ? "bg-slate-700" : "bg-gray-200"
                        }`}
                        aria-hidden
                      />
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p
                          className={`truncate text-sm font-medium ${
                            active || done ? "text-slate-900" : "text-slate-500"
                          }`}
                        >
                          {s.label}
                        </p>
                        <p className="shrink-0 text-xs tabular-nums text-slate-400">{s.id}/3</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,44rem),1fr]">
              <div className="min-w-0">
                {step === 1 ? (
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                      Pay period fundamentals
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      These settings control default Timesheets ranges and weekly calculations.
                    </p>

                    <div className="mt-8 grid grid-cols-1 gap-6">
                      <div>
                        <label className="text-sm font-medium text-slate-800">
                          Workweek Commencement
                        </label>
                        <div className="relative mt-2">
                          <select
                            value={String(weekStartsOn)}
                            onChange={(e) => setWeekStartsOn(Number(e.target.value))}
                            className="h-11 w-full cursor-pointer appearance-none rounded-md border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                          >
                            <option value="0">Sunday</option>
                            <option value="1">Monday</option>
                            <option value="2">Tuesday</option>
                            <option value="3">Wednesday</option>
                            <option value="4">Thursday</option>
                            <option value="5">Friday</option>
                            <option value="6">Saturday</option>
                          </select>
                          <ChevronDown
                            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                            aria-hidden
                          />
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                          Affects Week and Bi-week navigation, weekly rollups, and overtime windows.
                        </p>
                      </div>

                      <div>
                        <label htmlFor="period-kind" className="text-sm font-medium text-slate-800">
                          Pay Frequency
                        </label>
                        <div className="relative mt-2">
                          <select
                            id="period-kind"
                            value={
                              kind === "weekly"
                                ? "weekly"
                                : kind === "bi_weekly"
                                  ? "bi_weekly"
                                  : kind === "monthly"
                                    ? "monthly"
                                    : kind === "semi_monthly" || kind === "custom"
                                      ? "semi_monthly"
                                      : kind
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (
                                v === "weekly" ||
                                v === "bi_weekly" ||
                                v === "monthly" ||
                                v === "semi_monthly"
                              ) {
                                setKind(
                                  v === "semi_monthly" ? "semi_monthly" : (v as TimesheetPeriodKind),
                                );
                              }
                            }}
                            className="h-11 w-full cursor-pointer appearance-none rounded-md border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                          >
                            <option value="weekly">1 week</option>
                            <option value="bi_weekly">2 weeks</option>
                            <option value="monthly">1 month</option>
                            <option value="semi_monthly">Twice a month</option>
                          </select>
                          <ChevronDown
                            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                            aria-hidden
                          />
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                          Sets the default Timesheets window shown when managers open this clock.
                        </p>
                      </div>

                      <div>
                        <label htmlFor="monthly-ends-on" className="text-sm font-medium text-slate-800">
                          Cycle Cut-off
                        </label>
                        <div className="relative mt-2">
                          <select
                            id="monthly-ends-on"
                            value={String(monthlyEndsOn)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "last_day") setMonthlyEndsOn("last_day");
                              else {
                                const n = Number(v);
                                if (n === 26 || n === 27 || n === 28 || n === 29 || n === 30) {
                                  setMonthlyEndsOn(n);
                                }
                              }
                            }}
                            disabled={kind !== "monthly"}
                            className={`h-11 w-full cursor-pointer appearance-none rounded-md border bg-white px-3 pr-12 text-sm shadow-sm outline-none transition focus:ring-2 ${
                              kind !== "monthly"
                                ? "cursor-not-allowed border-slate-200 text-slate-400 opacity-70"
                                : "border-slate-200 text-slate-900 focus:border-orange-300 focus:ring-orange-500/15"
                            }`}
                          >
                            <option value="26">26th</option>
                            <option value="27">27th</option>
                            <option value="28">28th</option>
                            <option value="29">29th</option>
                            <option value="30">30th</option>
                            <option value="last_day">Last day of month</option>
                          </select>
                          <ChevronDown
                            className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 ${
                              kind !== "monthly" ? "text-slate-300" : "text-slate-500"
                            }`}
                            aria-hidden
                          />
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                          Monthly cycles can follow a cutoff (e.g. ends on 26th → 27th–26th).
                        </p>
                      </div>

                      <div className="border-t border-gray-100 pt-6">
                        <div className="flex items-baseline justify-between">
                          <p className="text-sm font-semibold text-slate-900">Integrations</p>
                          <span className="text-xs text-slate-400">Optional</span>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-5">
                          <div>
                            <label className="text-sm font-medium text-slate-800">
                              Payroll Integration
                            </label>
                            <div className="relative mt-2">
                              <select
                                value={payrollSoftware}
                                onChange={(e) => setPayrollSoftware(e.target.value)}
                                className="h-11 w-full cursor-pointer appearance-none rounded-md border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                              >
                                <option value="">Select</option>
                                <option value="ADP">ADP</option>
                                <option value="Paychex">Paychex</option>
                                <option value="Gusto">Gusto</option>
                                <option value="QuickBooks Payroll">QuickBooks Payroll</option>
                                <option value="UKG">UKG</option>
                                <option value="Other">Other</option>
                              </select>
                              <ChevronDown
                                className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                                aria-hidden
                              />
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                              Stored as a reminder for managers and payroll admins.
                            </p>
                          </div>

                          <div>
                            <label className="text-sm font-medium text-slate-800">
                              Payroll handling
                            </label>
                            <div className="relative mt-2">
                              <select
                                value={payrollHandled}
                                onChange={(e) => setPayrollHandled(e.target.value)}
                                className="h-11 w-full cursor-pointer appearance-none rounded-md border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                              >
                                <option value="">Select</option>
                                <option value="In-house">In-house</option>
                                <option value="Accounting firm">Accounting firm</option>
                                <option value="Payroll provider">Payroll provider</option>
                                <option value="Franchise / HQ">Franchise / HQ</option>
                                <option value="Other">Other</option>
                              </select>
                              <ChevronDown
                                className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                                aria-hidden
                              />
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                              Helps standardize handoffs during pay close.
                            </p>
                          </div>

                          <div>
                            <label className="text-sm font-medium text-slate-800">
                              Payroll owner
                            </label>
                            <div className="relative mt-2">
                              <select
                                value={payrollOwner}
                                onChange={(e) => setPayrollOwner(e.target.value)}
                                className="h-11 w-full cursor-pointer appearance-none rounded-md border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                              >
                                <option value="">Select</option>
                                <option value="Store manager">Store manager</option>
                                <option value="Area manager">Area manager</option>
                                <option value="HR / People Ops">HR / People Ops</option>
                                <option value="Accounting">Accounting</option>
                                <option value="Owner">Owner</option>
                                <option value="Other">Other</option>
                              </select>
                              <ChevronDown
                                className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                                aria-hidden
                              />
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                              Clarifies who signs off before payroll export.
                            </p>
                          </div>
                        </div>
                      </div>

                      {clocksForBulkApply.length > 0 ? (
                        <div className="border-t border-gray-100 pt-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">Bulk apply</p>
                              <p className="mt-1 text-sm text-slate-600">
                                Copy these payroll rules to multiple stores in one action.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setBulkErr(null);
                                setBulkQuery("");
                                setBulkSelected(new Set());
                                setBulkOpen(true);
                              }}
                              className="inline-flex h-10 shrink-0 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
                            >
                              Select clocks
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {(kind === "semi_monthly" || kind === "custom") ? (
                        <div className="border-t border-gray-100 pt-6">
                          <label htmlFor="split-day" className="text-sm font-medium text-slate-800">
                            Semi-monthly split day
                          </label>
                          <div className="mt-2 flex items-center gap-3">
                            <input
                              id="split-day"
                              type="number"
                              min={1}
                              max={27}
                              value={splitDay}
                              onChange={(e) => setSplitDay(e.target.value)}
                              className="h-11 w-[9rem] rounded-md border border-slate-200 bg-white px-3 text-sm tabular-nums text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                            />
                            <p className="text-xs leading-relaxed text-slate-500">
                              First segment ends on this day (e.g. 15 → 1–15 and 16–end of month).
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                      Location tracking
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Choose how (and when) the app captures location for punches.
                    </p>

                    <div className="mt-8 grid grid-cols-1 gap-4 border-t border-gray-100 pt-6 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => setTrackingMode("breadcrumbs")}
                        disabled
                        className={`group relative overflow-hidden rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                          trackingMode === "breadcrumbs"
                            ? "border-orange-300 ring-2 ring-orange-500/10"
                            : "border-slate-200 hover:border-slate-300"
                        } opacity-70`}
                        title="Coming soon"
                      >
                        <p className="text-sm font-semibold text-slate-900">Breadcrumbs</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Live route tracking while on the clock.
                        </p>
                        <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          Coming soon
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTrackingMode("clock_in_out")}
                        className={`relative overflow-hidden rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                          trackingMode === "clock_in_out"
                            ? "border-orange-300 ring-2 ring-orange-500/10"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <p className="text-sm font-semibold text-slate-900">Clock in &amp; out</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Capture location only on clock-in and clock-out.
                        </p>
                        <div className="mt-3 text-xs font-medium text-slate-500">
                          Recommended
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTrackingMode("off")}
                        className={`relative overflow-hidden rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                          trackingMode === "off"
                            ? "border-orange-300 ring-2 ring-orange-500/10"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <p className="text-sm font-semibold text-slate-900">Off</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Don’t track location at all.
                        </p>
                      </button>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">Require location to punch</p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          When enabled, employees must share location to clock in/out (even without a geofence).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRequireLocation((o) => !o)}
                        disabled={trackingMode === "off"}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                          trackingMode === "off"
                            ? "cursor-not-allowed bg-slate-200 opacity-60"
                            : requireLocation
                              ? "bg-orange-600"
                              : "bg-slate-200"
                        }`}
                        aria-pressed={requireLocation}
                        title={trackingMode === "off" ? "Turn on tracking first" : "Toggle requirement"}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                            requireLocation ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-2">
                      <Link
                        href="/locations"
                        className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
                      >
                        Store geofence (optional)
                      </Link>
                      <p className="text-xs text-slate-500">
                        Geofence enforcement is configured per store.
                      </p>
                    </div>
                  </div>
                ) : null}

                {step === 3 ? (
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                      Categorization &amp; access
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Choose what the team tracks time for, and who can use this clock.
                    </p>

                    <div className="mt-8 border-t border-gray-100 pt-6">
                      <p className="text-sm font-medium text-slate-800">Categorization</p>
                      <p className="mt-2 text-sm text-slate-600">
                        Categorize punches by job or location for reporting and exports.
                      </p>

                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => setCatMode("none")}
                          className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                            catMode === "none"
                              ? "border-orange-300 ring-2 ring-orange-500/10"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900">None</p>
                          <p className="mt-1 text-xs text-slate-600">
                            Simple clock in &amp; out.
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatMode("job")}
                          className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                            catMode === "job"
                              ? "border-orange-300 ring-2 ring-orange-500/10"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900">Job</p>
                          <p className="mt-1 text-xs text-slate-600">
                            Tag shifts by job code.
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {jobCodes.length} available
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatMode("location")}
                          className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                            catMode === "location"
                              ? "border-orange-300 ring-2 ring-orange-500/10"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900">Location</p>
                          <p className="mt-1 text-xs text-slate-600">
                            Tag shifts by location code.
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {locationCodes.length} available
                          </p>
                        </button>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">Require selection</p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            When enabled, employees must pick a value before clock-in succeeds.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRequireCat((o) => !o)}
                          disabled={catMode === "none"}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                            catMode === "none"
                              ? "cursor-not-allowed bg-slate-200 opacity-60"
                              : requireCat
                                ? "bg-orange-600"
                                : "bg-slate-200"
                          }`}
                          aria-pressed={requireCat}
                          title={catMode === "none" ? "Pick Job or Location first" : "Toggle requirement"}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                              requireCat ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        These codes are company-wide (shared across stores). Add values in Supabase for now; UI management can be added next.
                      </p>
                    </div>

                    <div className="mt-8 border-t border-gray-100 pt-6">
                      <p className="text-sm font-medium text-slate-800">Assignments</p>
                      <p className="mt-2 text-sm text-slate-600">
                        Use Smart groups to assign employees to this clock.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/users/groups?timeClock=${encodeURIComponent(timeClockId)}`}
                          className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
                        >
                          Manage in Smart groups
                        </Link>
                        <span className="text-xs text-slate-500">
                          {smartGroupsForClock.length} group{smartGroupsForClock.length === 1 ? "" : "s"} available
                        </span>
                      </div>

                      {smartGroupsForClock.length > 0 ? (
                        <div className="mt-6">
                          <label className="sr-only" htmlFor="asg-search">
                            Search groups
                          </label>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              id="asg-search"
                              value={asgQuery}
                              onChange={(e) => setAsgQuery(e.target.value)}
                              placeholder="Search smart groups"
                              className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                            />
                          </div>
                          <div className="mt-3 max-h-64 overflow-auto rounded-md border border-gray-100 bg-white">
                            <ul className="divide-y divide-gray-100">
                              {filteredSmartGroups.map((g) => {
                                const on = asgOn.has(g.id);
                                return (
                                  <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-slate-900">{g.label}</p>
                                      <p className="text-xs text-slate-500">
                                        {on ? "Assigned to this clock" : "Not assigned"}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={asgBusy || !canManageSmartGroups}
                                      onClick={() => toggleSmartGroup(g.id, !on)}
                                      className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition disabled:opacity-50 ${
                                        on
                                          ? "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                          : "bg-orange-600 text-white hover:bg-orange-600"
                                      }`}
                                      title={
                                        canManageSmartGroups
                                          ? on
                                            ? "Remove assignment"
                                            : "Assign to this clock"
                                          : "You need users.manage permission to change assignments."
                                      }
                                    >
                                      {on ? "Remove" : "Assign"}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                          {asgError ? (
                            <p className="mt-3 text-sm text-red-700" role="alert">
                              {asgError}
                            </p>
                          ) : null}
                          {!canManageSmartGroups ? (
                            <p className="mt-3 text-xs text-slate-500">
                              You can view assignments here, but only users with <span className="font-mono">users.manage</span>{" "}
                              can change them.
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-slate-600">
                          No smart groups found for this store yet. Create one in Smart groups, then assign it here.
                        </p>
                      )}

                      <p className="mt-4 text-xs text-slate-500">
                        Tip: If no group is assigned to this clock, it remains open to all employees at the store.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="pt-2">
                  {err ? (
                    <p className="text-sm text-red-700" role="alert">
                      {err}
                    </p>
                  ) : null}
                  {msg ? (
                    <p className="text-sm text-emerald-800" role="status">
                      {msg}
                    </p>
                  ) : null}
                </div>
              </div>

              <aside className="hidden lg:block">
                <div className="sticky top-6 border-l border-gray-100 pl-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Guidance
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">Minimum text. Maximum clarity.</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Configure this per store so East and West can follow different payroll timelines. Timesheets
                    uses these rules as the default period window; managers can still pick custom ranges.
                  </p>
                  <div className="mt-6 border-t border-gray-100 pt-6">
                    <p className="text-sm font-medium text-slate-900">Save behavior</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Changes are applied immediately for this Time Clock.
                    </p>
                  </div>
                </div>
              </aside>
            </div>

            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/55">
              <div className="mx-auto w-full max-w-6xl border-t border-gray-100 px-4 py-4 sm:px-6 lg:px-8">
                <div className="pointer-events-auto flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={pending || step <= 1}
                    onClick={() => setStep((s) => Math.max(1, s - 1))}
                    className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Back
                  </button>
                  <div className="flex items-center gap-2">
                    {step < 3 ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setStep((s) => Math.min(3, s + 1))}
                        className={`${PRIMARY_ORANGE_CTA} h-10 px-5 text-sm font-semibold disabled:opacity-50`}
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => saveAllSetup()}
                        className={`${PRIMARY_ORANGE_CTA} h-10 px-5 text-sm font-semibold disabled:opacity-50`}
                      >
                        {pending ? "Saving…" : "Save"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="h-20" aria-hidden />
          </div>
        )}
      </div>

      {bulkOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Bulk apply payroll rules"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !bulkBusy) setBulkOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Bulk apply payroll rules</h3>
              <p className="mt-1 text-sm text-slate-600">
                Apply the current setup to selected time clocks.
              </p>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={bulkQuery}
                  onChange={(e) => setBulkQuery(e.target.value)}
                  placeholder="Search clocks"
                  className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {bulkSelected.size} selected
                </p>
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                  onClick={() => {
                    if (bulkSelected.size === filteredBulkTargets.length) {
                      setBulkSelected(new Set());
                    } else {
                      setBulkSelected(new Set(filteredBulkTargets.map((c) => c.id)));
                    }
                  }}
                >
                  {bulkSelected.size === filteredBulkTargets.length ? "Clear" : "Select all"}
                </button>
              </div>
              <div className="max-h-72 overflow-auto rounded-md border border-gray-100">
                <ul className="divide-y divide-gray-100">
                  {filteredBulkTargets.map((c) => {
                    const on = bulkSelected.has(c.id);
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <label className="flex min-w-0 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setBulkSelected((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(c.id);
                                else next.delete(c.id);
                                return next;
                              });
                            }}
                          />
                          <span className="truncate text-sm text-slate-800">{c.label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {bulkErr ? (
                <p className="text-sm text-red-700" role="alert">
                  {bulkErr}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkOpen(false)}
                className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => runBulkApply()}
                className={`${PRIMARY_ORANGE_CTA} h-10 px-5 text-sm font-semibold disabled:opacity-50`}
              >
                {bulkBusy ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
