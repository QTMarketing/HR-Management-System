"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Bell,
  ChevronDown,
  Compass,
  Lock,
  MapPin,
  Search,
  Settings2,
  Timer,
  Wallet,
} from "lucide-react";
import { bulkApplyTimeClockTimesheetPeriod, saveTimeClockTimesheetPeriod } from "@/app/actions/time-clock-period";
import { saveTimeClockTrackingAndCategorization } from "@/app/actions/time-clock-setup";
import { saveTimeClockBreakSettings } from "@/app/actions/time-clock-break-settings";
import { saveTimeClockGeneralSettings } from "@/app/actions/time-clock-general-settings";
import type { TimesheetPeriodConfig, TimesheetPeriodKind } from "@/lib/time-clock/timesheet-period";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

type SettingsTab =
  | "general"
  | "time_tracking"
  | "payroll"
  | "breaks"
  | "geolocation"
  | "reminders"
  | "notifications";

type Props = {
  timeClockId: string;
  initialKind: TimesheetPeriodKind;
  initialConfig: TimesheetPeriodConfig;
  canEdit: boolean;
  /** Store this clock belongs to (for links to geofence / store settings). */
  storeLocationId?: string | null;
  clocksForBulkApply?: { id: string; label: string }[];
  initialLocationTrackingMode: "off" | "clock_in_out" | "breadcrumbs";
  initialRequireLocationForPunch: boolean;
  initialCategorizationMode: "none" | "job" | "location";
  initialRequireCategorization: boolean;
  jobCodes: { id: string; label: string; colorToken?: string }[];
  locationCodes: { id: string; label: string; colorToken?: string }[];
  initialBreaksEnabled: boolean;
  initialAllowPaidBreaks: boolean;
  initialBreaksMode: "disabled" | "manual" | "automatic";
  initialBreaksManualRules: unknown;
  initialBreaksAutoRules: unknown;
  initialWorkDays: number[];
  initialWorkHoursStart: string;
  initialWorkHoursEnd: string;
  initialDailyLimitEnabled: boolean;
  initialDailyLimitHours: number;
  initialAutoClockOutEnabled: boolean;
  initialAutoClockOutAfterHours: number;
  initialAllowManagerEdits: boolean;
};

export function TimeClockSettingsForm({
  timeClockId,
  initialKind,
  initialConfig,
  canEdit,
  storeLocationId = null,
  clocksForBulkApply = [],
  initialLocationTrackingMode,
  initialRequireLocationForPunch,
  initialCategorizationMode,
  initialRequireCategorization,
  jobCodes,
  locationCodes,
  initialBreaksEnabled,
  initialAllowPaidBreaks,
  initialBreaksMode,
  initialBreaksManualRules,
  initialBreaksAutoRules,
  initialWorkDays,
  initialWorkHoursStart,
  initialWorkHoursEnd,
  initialDailyLimitEnabled,
  initialDailyLimitHours,
  initialAutoClockOutEnabled,
  initialAutoClockOutAfterHours,
  initialAllowManagerEdits,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
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

  const tabFromUrl = ((): SettingsTab => {
    const raw = searchParams.get("tab")?.trim();
    if (
      raw === "general" ||
      raw === "time_tracking" ||
      raw === "payroll" ||
      raw === "breaks" ||
      raw === "geolocation" ||
      raw === "reminders" ||
      raw === "notifications"
    ) {
      return raw;
    }
    return "general";
  })();

  const setTab = (next: SettingsTab) => {
    startTransition(() => {
      const q = new URLSearchParams(searchParams.toString());
      q.set("view", "settings");
      q.set("tab", next);
      const suffix = q.toString();
      router.push(suffix ? `/time-clock/${timeClockId}?${suffix}` : `/time-clock/${timeClockId}`);
    });
  };

  // Geolocation settings
  const [trackingMode, setTrackingMode] = useState<
    "off" | "clock_in_out" | "breadcrumbs"
  >(initialLocationTrackingMode);
  const [requireLocation, setRequireLocation] = useState<boolean>(
    initialRequireLocationForPunch,
  );

  // Categorization (saved alongside geolocation settings)
  const [catMode, setCatMode] = useState<"none" | "job" | "location">(
    initialCategorizationMode,
  );
  const [requireCat, setRequireCat] = useState<boolean>(initialRequireCategorization);

  // General policies (Connecteam-like)
  const [workDays, setWorkDays] = useState<Set<number>>(
    () =>
      new Set(
        (initialWorkDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
  );
  const [workHoursStart, setWorkHoursStart] = useState(initialWorkHoursStart ?? "09:00");
  const [workHoursEnd, setWorkHoursEnd] = useState(initialWorkHoursEnd ?? "17:00");
  const [dailyLimitEnabled, setDailyLimitEnabled] = useState(Boolean(initialDailyLimitEnabled));
  const [dailyLimitHours, setDailyLimitHours] = useState(String(initialDailyLimitHours ?? 12));
  const [autoClockOutEnabled, setAutoClockOutEnabled] = useState(Boolean(initialAutoClockOutEnabled));
  const [autoClockOutAfterHours, setAutoClockOutAfterHours] = useState(
    String(initialAutoClockOutAfterHours ?? 16),
  );
  const [allowManagerEdits, setAllowManagerEdits] = useState(Boolean(initialAllowManagerEdits));
  const [generalErr, setGeneralErr] = useState<string | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Break settings
  const [breaksEnabled, setBreaksEnabled] = useState<boolean>(initialBreaksEnabled);
  const [allowPaidBreaks, setAllowPaidBreaks] = useState<boolean>(initialAllowPaidBreaks);
  const [breaksMode, setBreaksMode] = useState<"disabled" | "manual" | "automatic">(
    initialBreaksMode ?? "manual",
  );

  type ManualBreakRule = {
    id: string;
    label: string;
    paid: boolean;
    durationMinutes: number;
    everyHours: number;
    restrictEarlyReturn: boolean;
  };
  type AutoBreakRule = {
    id: string;
    deductMinutes: number;
    afterDailyHours: number;
  };

  const [manualRules, setManualRules] = useState<ManualBreakRule[]>(() => {
    const raw = initialBreaksManualRules;
    if (!Array.isArray(raw)) {
      return [
        {
          id: "lunch",
          label: "Lunch break",
          paid: false,
          durationMinutes: 30,
          everyHours: 5,
          restrictEarlyReturn: false,
        },
      ];
    }
    const next: ManualBreakRule[] = [];
    for (const r of raw as unknown[]) {
      const x = (typeof r === "object" && r != null ? (r as Record<string, unknown>) : null) as
        | Record<string, unknown>
        | null;
      const label = typeof x?.label === "string" ? (x.label as string) : "Break";
      next.push({
        id: typeof x?.id === "string" ? (x.id as string) : `${Date.now()}-${Math.random()}`,
        label,
        paid: Boolean(x?.paid),
        durationMinutes: Number.isFinite(Number(x?.durationMinutes))
          ? Number(x?.durationMinutes)
          : Number.isFinite(Number(x?.duration_minutes))
            ? Number(x?.duration_minutes)
            : 30,
        everyHours: Number.isFinite(Number(x?.everyHours))
          ? Number(x?.everyHours)
          : Number.isFinite(Number(x?.every_hours))
            ? Number(x?.every_hours)
            : 5,
        restrictEarlyReturn: Boolean(
          (x?.restrictEarlyReturn ?? x?.restrict_early_return ?? false) as unknown,
        ),
      });
    }
    return next.length > 0
      ? next
      : [
          {
            id: "lunch",
            label: "Lunch break",
            paid: false,
            durationMinutes: 30,
            everyHours: 5,
            restrictEarlyReturn: false,
          },
        ];
  });

  const [autoRules, setAutoRules] = useState<AutoBreakRule[]>(() => {
    const raw = initialBreaksAutoRules;
    if (!Array.isArray(raw)) {
      return [{ id: "auto-1", deductMinutes: 30, afterDailyHours: 7 }];
    }
    const next: AutoBreakRule[] = [];
    for (const r of raw as unknown[]) {
      const x = (typeof r === "object" && r != null ? (r as Record<string, unknown>) : null) as
        | Record<string, unknown>
        | null;
      next.push({
        id: typeof x?.id === "string" ? (x.id as string) : `${Date.now()}-${Math.random()}`,
        deductMinutes: Number.isFinite(Number(x?.deductMinutes))
          ? Number(x?.deductMinutes)
          : Number.isFinite(Number(x?.deduct_minutes))
            ? Number(x?.deduct_minutes)
            : 30,
        afterDailyHours: Number.isFinite(Number(x?.afterDailyHours))
          ? Number(x?.afterDailyHours)
          : Number.isFinite(Number(x?.after_daily_hours))
            ? Number(x?.after_daily_hours)
            : 7,
      });
    }
    return next.length > 0 ? next : [{ id: "auto-1", deductMinutes: 30, afterDailyHours: 7 }];
  });

  const [breakErr, setBreakErr] = useState<string | null>(null);

  const [bulkQuery, setBulkQuery] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());

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

  function savePayroll() {
    setErr(null);
    setMsg(null);
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
      setMsg("Payroll settings saved.");
      router.refresh();
    });
  }

  function saveGeolocation() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const r2 = await saveTimeClockTrackingAndCategorization({
        timeClockId,
        location_tracking_mode: trackingMode,
        require_location_for_punch: requireLocation,
        categorization_mode: catMode,
        require_categorization: requireCat,
      });
      if (!r2.ok) {
        setErr(r2.error);
        return;
      }
      setMsg("Geolocation settings saved.");
      router.refresh();
    });
  }

  function saveBreaks() {
    setBreakErr(null);
    setMsg(null);
    startTransition(async () => {
      const r = await saveTimeClockBreakSettings({
        timeClockId,
        breaks_enabled: breaksEnabled,
        allow_paid_breaks: allowPaidBreaks,
        breaks_mode: breaksMode,
        breaks_manual_rules: manualRules,
        breaks_auto_rules: autoRules,
      });
      if (!r.ok) {
        setBreakErr(r.error);
        return;
      }
      setMsg("Break settings saved.");
      router.refresh();
    });
  }

  function saveGeneral() {
    setGeneralErr(null);
    setMsg(null);
    startTransition(async () => {
      const days = [...workDays].sort((a, b) => a - b);
      const r = await saveTimeClockGeneralSettings({
        timeClockId,
        work_days: days,
        work_hours_start: workHoursStart,
        work_hours_end: workHoursEnd,
        daily_limit_enabled: dailyLimitEnabled,
        daily_limit_hours: Number(dailyLimitHours),
        auto_clock_out_enabled: autoClockOutEnabled,
        auto_clock_out_after_hours: Number(autoClockOutAfterHours),
        allow_manager_edits: allowManagerEdits,
      });
      if (!r.ok) {
        setGeneralErr(r.error);
        return;
      }
      setMsg("General settings saved.");
      router.refresh();
    });
  }

  // Smart group assignments intentionally removed from Settings.

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

  return (
    <section className="relative -mx-4 bg-slate-50 px-4 py-8 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Time Clock settings
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Policies &amp; controls
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            Configure pay periods, breaks, geolocation, reminders, and notifications—per store.
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
            <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[18rem,minmax(0,1fr)]">
              <aside className="min-w-0">
                <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                  <nav className="space-y-1" aria-label="Settings sections">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setTab("general")}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        tabFromUrl === "general"
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Settings2 className="h-4 w-4 text-slate-500" aria-hidden />
                      General
                    </button>
                    <button
                      type="button"
                      disabled
                      onClick={() => {}}
                      className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-400"
                      title="Mobile app required (coming later)"
                    >
                      <Timer className="h-4 w-4 text-slate-300" aria-hidden />
                      Time tracking
                      <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        later
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setTab("payroll")}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        tabFromUrl === "payroll"
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Wallet className="h-4 w-4 text-slate-500" aria-hidden />
                      Payroll
                    </button>

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setTab("breaks")}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        tabFromUrl === "breaks"
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Compass className="h-4 w-4 text-slate-500" aria-hidden />
                      Breaks
                    </button>

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setTab("geolocation")}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        tabFromUrl === "geolocation"
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <MapPin className="h-4 w-4 text-slate-500" aria-hidden />
                      Geolocation
                    </button>

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setTab("reminders")}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        tabFromUrl === "reminders"
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Bell className="h-4 w-4 text-slate-500" aria-hidden />
                      Reminders
                    </button>

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setTab("notifications")}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        tabFromUrl === "notifications"
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Lock className="h-4 w-4 text-slate-500" aria-hidden />
                      Notifications
                    </button>
                  </nav>
                </div>
              </aside>

              <div className="min-w-0">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                {tabFromUrl === "general" ? (
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">General</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Define default workdays, work hours, and safety limits for long shifts.
                    </p>

                    <div className="mt-8 grid grid-cols-1 gap-6 border-t border-gray-100 pt-6">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Work days</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Used as a default reference for managers and reporting.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {[
                            { d: 0, l: "S" },
                            { d: 1, l: "M" },
                            { d: 2, l: "T" },
                            { d: 3, l: "W" },
                            { d: 4, l: "T" },
                            { d: 5, l: "F" },
                            { d: 6, l: "S" },
                          ].map((x, idx) => {
                            const on = workDays.has(x.d);
                            return (
                              <button
                                key={`${x.d}-${idx}`}
                                type="button"
                                onClick={() =>
                                  setWorkDays((prev) => {
                                    const next = new Set(prev);
                                    if (on && next.size > 1) next.delete(x.d);
                                    else next.add(x.d);
                                    return next;
                                  })
                                }
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition ${
                                  on
                                    ? "border-orange-300 bg-orange-50 text-orange-900"
                                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                                title="Toggle day"
                              >
                                {x.l}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-slate-900">Work hours</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Defines a standard day for quick review (not a schedule).
                        </p>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-sm font-medium text-slate-800">From</span>
                            <input
                              type="time"
                              value={workHoursStart}
                              onChange={(e) => setWorkHoursStart(e.target.value)}
                              className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                            />
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-slate-800">To</span>
                            <input
                              type="time"
                              value={workHoursEnd}
                              onChange={(e) => setWorkHoursEnd(e.target.value)}
                              className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">Daily limit</p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              Warn when a single shift exceeds the limit.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDailyLimitEnabled((o) => !o)}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                              dailyLimitEnabled ? "bg-orange-600" : "bg-slate-200"
                            }`}
                            aria-pressed={dailyLimitEnabled}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                dailyLimitEnabled ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <input
                            type="number"
                            min={1}
                            step={0.5}
                            value={dailyLimitHours}
                            onChange={(e) => setDailyLimitHours(e.target.value)}
                            disabled={!dailyLimitEnabled}
                            className={`h-11 w-[10rem] rounded-md border bg-white px-3 text-sm tabular-nums shadow-sm outline-none transition focus:ring-2 ${
                              !dailyLimitEnabled
                                ? "cursor-not-allowed border-slate-200 text-slate-400 opacity-70"
                                : "border-slate-200 text-slate-900 focus:border-orange-300 focus:ring-orange-500/15"
                            }`}
                          />
                          <span className="text-sm text-slate-600">hours</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">Auto clock-out</p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              Close long open shifts automatically.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAutoClockOutEnabled((o) => !o)}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                              autoClockOutEnabled ? "bg-orange-600" : "bg-slate-200"
                            }`}
                            aria-pressed={autoClockOutEnabled}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                autoClockOutEnabled ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <span className="text-sm text-slate-600">After</span>
                          <input
                            type="number"
                            min={1}
                            step={0.5}
                            value={autoClockOutAfterHours}
                            onChange={(e) => setAutoClockOutAfterHours(e.target.value)}
                            disabled={!autoClockOutEnabled}
                            className={`h-11 w-[10rem] rounded-md border bg-white px-3 text-sm tabular-nums shadow-sm outline-none transition focus:ring-2 ${
                              !autoClockOutEnabled
                                ? "cursor-not-allowed border-slate-200 text-slate-400 opacity-70"
                                : "border-slate-200 text-slate-900 focus:border-orange-300 focus:ring-orange-500/15"
                            }`}
                          />
                          <span className="text-sm text-slate-600">hours</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              Allow managers to edit times
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              When off, managers cannot adjust clock-in/clock-out times for this clock.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAllowManagerEdits((o) => !o)}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                              allowManagerEdits ? "bg-orange-600" : "bg-slate-200"
                            }`}
                            aria-pressed={allowManagerEdits}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                allowManagerEdits ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {generalErr ? (
                      <p className="mt-4 text-sm text-red-700" role="alert">
                        {generalErr}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {tabFromUrl === "payroll" ? (
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

                {tabFromUrl === "geolocation" ? (
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
                        <p className="text-sm font-medium text-slate-900">Require location to clock in/out</p>
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
                        href={storeLocationId ? `/locations?location=${encodeURIComponent(storeLocationId)}` : "/locations"}
                        className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
                      >
                        Store geofence (optional)
                      </Link>
                      <p className="text-xs text-slate-500">
                        Geofence enforcement is configured per store.
                      </p>
                    </div>

                    <div className="mt-10 border-t border-gray-100 pt-6">
                      <p className="text-sm font-semibold text-slate-900">Categorization</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Require a Job code or Location code at clock-in for cleaner reporting and exports.
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
                          <p className="mt-1 text-xs text-slate-600">Simple clock in &amp; out.</p>
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
                          <p className="mt-1 text-xs text-slate-600">Tag shifts by job code.</p>
                          <p className="mt-2 text-xs text-slate-500">{jobCodes.length} available</p>
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
                          <p className="mt-1 text-xs text-slate-600">Tag shifts by location code.</p>
                          <p className="mt-2 text-xs text-slate-500">
                            {locationCodes.length} available
                          </p>
                        </button>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">Require selection</p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            When enabled, employees must choose a value before clock-in succeeds.
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
                    </div>
                  </div>
                ) : null}

                {tabFromUrl === "breaks" ? (
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">Breaks</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Configure manual breaks and automatic deductions.
                    </p>

                    <div className="mt-8 border-t border-gray-100 pt-6">
                      <div className="space-y-3">
                        {[
                          {
                            id: "disabled" as const,
                            title: "Disabled",
                            body: "Hide breaks in the time clock.",
                          },
                          {
                            id: "manual" as const,
                            title: "Manual breaks",
                            body: "Employees can take breaks during their work day.",
                          },
                          {
                            id: "automatic" as const,
                            title: "Automatic breaks",
                            body: "Deduct unpaid breaks automatically based on worked hours.",
                          },
                        ].map((opt) => {
                          const on = breaksMode === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                setBreaksMode(opt.id);
                                setBreaksEnabled(opt.id !== "disabled");
                              }}
                              className={`w-full rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition ${
                                on
                                  ? "border-orange-300 ring-2 ring-orange-500/10"
                                  : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900">{opt.title}</p>
                                  <p className="mt-0.5 text-xs text-slate-600">{opt.body}</p>
                                  {opt.id === "manual" ? (
                                    <p className="mt-2 text-xs text-slate-500">
                                      Set a reminder (coming soon)
                                    </p>
                                  ) : null}
                                </div>
                                <div
                                  className={`mt-0.5 h-4 w-4 rounded-full border ${
                                    on ? "border-orange-500 bg-orange-500" : "border-slate-300 bg-white"
                                  }`}
                                  aria-hidden
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">Allow paid breaks</p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            When off, only unpaid breaks can be selected.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAllowPaidBreaks((o) => !o)}
                          disabled={pending || breaksMode === "disabled"}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                            breaksMode === "disabled"
                              ? "cursor-not-allowed bg-slate-200 opacity-60"
                              : allowPaidBreaks
                                ? "bg-orange-600"
                                : "bg-slate-200"
                          }`}
                          aria-pressed={allowPaidBreaks}
                          title={breaksMode === "disabled" ? "Enable breaks first" : "Toggle paid breaks"}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                              allowPaidBreaks ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>

                      {breaksMode === "manual" ? (
                        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">Manual breaks</p>
                              <p className="mt-1 text-sm text-slate-600">
                                Configure the break types employees can log.
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                setManualRules((prev) => [
                                  ...prev,
                                  {
                                    id: `${Date.now()}-${Math.random()}`,
                                    label: "Break",
                                    paid: false,
                                    durationMinutes: 10,
                                    everyHours: 5,
                                    restrictEarlyReturn: false,
                                  },
                                ])
                              }
                              className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              + Add
                            </button>
                          </div>

                          <div className="mt-4 space-y-3">
                            {manualRules.map((r) => (
                              <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr,0.7fr,0.8fr,1fr,auto] sm:items-center">
                                  <div className="min-w-0">
                                    <label className="text-xs font-medium text-slate-600">Name</label>
                                    <input
                                      value={r.label}
                                      onChange={(e) =>
                                        setManualRules((prev) =>
                                          prev.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)),
                                        )
                                      }
                                      className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-slate-600">Type</label>
                                    <select
                                      value={r.paid ? "paid" : "unpaid"}
                                      disabled={!allowPaidBreaks}
                                      onChange={(e) =>
                                        setManualRules((prev) =>
                                          prev.map((x) =>
                                            x.id === r.id ? { ...x, paid: e.target.value === "paid" } : x,
                                          ),
                                        )
                                      }
                                      className={`mt-1 h-10 w-full cursor-pointer appearance-none rounded-md border bg-white px-3 pr-10 text-sm shadow-sm outline-none transition ${
                                        allowPaidBreaks
                                          ? "border-slate-200 text-slate-800 focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                                          : "cursor-not-allowed border-slate-200 text-slate-400 opacity-70"
                                      }`}
                                    >
                                      <option value="unpaid">Unpaid</option>
                                      <option value="paid">Paid</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-slate-600">Duration</label>
                                    <div className="mt-1 flex items-center gap-2">
                                      <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={r.durationMinutes}
                                        onChange={(e) =>
                                          setManualRules((prev) =>
                                            prev.map((x) =>
                                              x.id === r.id
                                                ? { ...x, durationMinutes: Number(e.target.value) || 0 }
                                                : x,
                                            ),
                                          )
                                        }
                                        className="h-10 w-[6.5rem] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                                      />
                                      <span className="text-sm text-slate-600">min</span>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-slate-600">Every</label>
                                    <div className="mt-1 flex items-center gap-2">
                                      <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={r.everyHours}
                                        onChange={(e) =>
                                          setManualRules((prev) =>
                                            prev.map((x) =>
                                              x.id === r.id
                                                ? { ...x, everyHours: Number(e.target.value) || 0 }
                                                : x,
                                            ),
                                          )
                                        }
                                        className="h-10 w-[6.5rem] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                                      />
                                      <span className="text-sm text-slate-600">hours</span>
                                    </div>
                                  </div>
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      disabled={pending || manualRules.length <= 1}
                                      onClick={() => setManualRules((prev) => prev.filter((x) => x.id !== r.id))}
                                      className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                                      title={manualRules.length <= 1 ? "Keep at least one rule" : "Remove"}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>

                                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={r.restrictEarlyReturn}
                                    onChange={(e) =>
                                      setManualRules((prev) =>
                                        prev.map((x) =>
                                          x.id === r.id ? { ...x, restrictEarlyReturn: e.target.checked } : x,
                                        ),
                                      )
                                    }
                                  />
                                  Restrict early returns from this break
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {breaksMode === "automatic" ? (
                        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">Automatic breaks</p>
                              <p className="mt-1 text-sm text-slate-600">
                                Deduct unpaid break time automatically.
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                setAutoRules((prev) => [
                                  ...prev,
                                  {
                                    id: `${Date.now()}-${Math.random()}`,
                                    deductMinutes: 30,
                                    afterDailyHours: 7,
                                  },
                                ])
                              }
                              className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              + Add
                            </button>
                          </div>

                          <div className="mt-4 space-y-3">
                            {autoRules.map((r) => (
                              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <span className="text-sm text-slate-700">Deduct</span>
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={r.deductMinutes}
                                  onChange={(e) =>
                                    setAutoRules((prev) =>
                                      prev.map((x) =>
                                        x.id === r.id
                                          ? { ...x, deductMinutes: Number(e.target.value) || 0 }
                                          : x,
                                      ),
                                    )
                                  }
                                  className="h-10 w-[6.5rem] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                                />
                                <span className="text-sm text-slate-700">min after a daily total of</span>
                                <input
                                  type="number"
                                  min={1}
                                  step={0.5}
                                  value={r.afterDailyHours}
                                  onChange={(e) =>
                                    setAutoRules((prev) =>
                                      prev.map((x) =>
                                        x.id === r.id
                                          ? { ...x, afterDailyHours: Number(e.target.value) || 0 }
                                          : x,
                                      ),
                                    )
                                  }
                                  className="h-10 w-[6.5rem] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                                />
                                <span className="text-sm text-slate-700">hours</span>
                                <button
                                  type="button"
                                  disabled={pending || autoRules.length <= 1}
                                  onClick={() => setAutoRules((prev) => prev.filter((x) => x.id !== r.id))}
                                  className="ml-auto inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                                  title={autoRules.length <= 1 ? "Keep at least one rule" : "Remove"}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>

                          <p className="mt-3 text-xs text-slate-500">
                            Note: deduction rules are stored now; applying them to worked-time totals is the next step.
                          </p>
                        </div>
                      ) : null}

                      <p className="mt-6 text-xs text-slate-500">
                        Breaks are shown in Timesheets and exports when recorded.
                      </p>
                    </div>

                    {breakErr ? (
                      <p className="mt-4 text-sm text-red-700" role="alert">
                        {breakErr}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {tabFromUrl === "reminders" ? (
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">Reminders</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Scheduled reminders (clock in/out, breaks) will be added after mobile is in place.
                    </p>
                    <div className="mt-8 rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600 shadow-sm">
                      Coming soon.
                    </div>
                  </div>
                ) : null}

                {tabFromUrl === "notifications" ? (
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                      Notifications
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Exceptions (missed clock-in/out, approvals needed, break violations) will surface here.
                    </p>
                    <div className="mt-8 rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600 shadow-sm">
                      Coming soon.
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
              </div>
            </div>

            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/55">
              <div className="mx-auto w-full max-w-6xl border-t border-gray-100 px-4 py-4 sm:px-6 lg:px-8">
                <div className="pointer-events-auto flex items-center justify-end gap-2">
                  {tabFromUrl === "general" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => saveGeneral()}
                      className={`${PRIMARY_ORANGE_CTA} h-10 px-5 text-sm font-semibold disabled:opacity-50`}
                    >
                      {pending ? "Saving…" : "Save changes"}
                    </button>
                  ) : tabFromUrl === "payroll" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => savePayroll()}
                      className={`${PRIMARY_ORANGE_CTA} h-10 px-5 text-sm font-semibold disabled:opacity-50`}
                    >
                      {pending ? "Saving…" : "Save changes"}
                    </button>
                  ) : tabFromUrl === "geolocation" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => saveGeolocation()}
                      className={`${PRIMARY_ORANGE_CTA} h-10 px-5 text-sm font-semibold disabled:opacity-50`}
                    >
                      {pending ? "Saving…" : "Save changes"}
                    </button>
                  ) : tabFromUrl === "breaks" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => saveBreaks()}
                      className={`${PRIMARY_ORANGE_CTA} h-10 px-5 text-sm font-semibold disabled:opacity-50`}
                    >
                      {pending ? "Saving…" : "Save changes"}
                    </button>
                  ) : null}
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
