"use client";

import {
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock,
  Palmtree,
  RefreshCcw,
  Thermometer,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { getPtoBalancesForEmployee, type GetPtoBalancesResult } from "@/app/actions/pto-balances";
import { PtoLedgerView } from "@/components/employee/pto-ledger-view";
import type { PtoLedgerEntry } from "@/lib/pto/ledger-types";
import { EmployeeTimeOffRequestModal } from "@/components/time-clock/employee-time-off-request-modal";
import { TimeClockSelfServe } from "@/components/time-clock/time-clock-self-serve";
import type {
  EmployeeHubSelfServeProps,
  LoadEmployeeHubDataResult,
} from "@/lib/employee/load-employee-hub-data";
import {
  consumeRequestTimeOffFlag,
  REQUEST_TIME_OFF_EVENT,
} from "@/lib/ui/request-time-off-signal";
import { employeePortalRevealClass } from "@/lib/ui/employee-portal-shell";

type Props = {
  employeeId: string;
  displayName?: string;
  hub: LoadEmployeeHubDataResult;
  initialPto: GetPtoBalancesResult;
  initialLedger: PtoLedgerEntry[];
  initialLedgerError?: string | null;
};

function fmtHours(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function fmtShiftRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—";
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  if (sameDay) {
    return `${s.toLocaleString(undefined, dateOpts)} · ${s.toLocaleTimeString(undefined, timeOpts)} – ${e.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${s.toLocaleString(undefined, { ...dateOpts, ...timeOpts })} → ${e.toLocaleString(undefined, { ...dateOpts, ...timeOpts })}`;
}

function firstNameFrom(raw: string | null | undefined): string {
  const t = raw?.trim() ?? "";
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? "there";
}

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

type ClockStatus = "out" | "in" | "break";

function clockStatusFrom(self: EmployeeHubSelfServeProps | null): ClockStatus {
  if (!self?.viewerOpenEntryId) return "out";
  if (self.viewerOpenBreakId) return "break";
  return "in";
}

function clockStatusMeta(status: ClockStatus, clockInAt?: string | null) {
  if (status === "break") {
    return {
      label: "On break",
      detail: clockInAt
        ? `Shift since ${new Date(clockInAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
        : "Paused",
      className: "border-amber-200/80 bg-amber-50 text-amber-950 ring-amber-200/60",
      dot: "bg-amber-500",
    };
  }
  if (status === "in") {
    return {
      label: "On shift",
      detail: clockInAt
        ? `Since ${new Date(clockInAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
        : "Clocked in",
      className: "border-emerald-200/80 bg-emerald-50 text-emerald-950 ring-emerald-200/60",
      dot: "bg-emerald-500",
    };
  }
  return {
    label: "Off shift",
    detail: "Ready to clock in",
    className: "border-slate-200 bg-white text-slate-800 ring-slate-200/80",
    dot: "bg-slate-300",
  };
}

export function EmployeeHub({
  employeeId,
  displayName,
  hub,
  initialPto,
  initialLedger,
  initialLedgerError = null,
}: Props) {
  const router = useRouter();
  const [pto, setPto] = useState<GetPtoBalancesResult>(initialPto);
  const [timeOffOpen, setTimeOffOpen] = useState(false);
  const [ptoPending, startPtoTransition] = useTransition();

  const refreshPto = useCallback(() => {
    startPtoTransition(async () => {
      const res = await getPtoBalancesForEmployee(employeeId);
      setPto(res);
    });
  }, [employeeId]);

  useEffect(() => {
    if (consumeRequestTimeOffFlag()) setTimeOffOpen(true);
    function onOpen() {
      setTimeOffOpen(true);
    }
    window.addEventListener(REQUEST_TIME_OFF_EVENT, onOpen);
    return () => window.removeEventListener(REQUEST_TIME_OFF_EVENT, onOpen);
  }, []);

  const selfServe = hub.selfServe;
  const firstName = firstNameFrom(displayName ?? selfServe?.viewerEmployeeName);
  const greeting = greetingForHour(new Date().getHours());
  const clockStatus = clockStatusFrom(selfServe);
  const statusMeta = clockStatusMeta(clockStatus, selfServe?.viewerOpenEntryClockInAt);

  const vacationHours = pto.ok ? pto.vacationHours : null;
  const sickHours = pto.ok ? pto.sickHours : null;

  const nextShift = hub.nextShift;
  const profileHref = `/users/${employeeId}`;

  const quickLinks = useMemo(
    () => [
      { href: "/my-punches", label: "My punches", icon: Clock },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
      { href: profileHref, label: "Profile", icon: User },
    ],
    [profileHref],
  );

  return (
    <div className="relative pb-10">
      <div
        className="pointer-events-none absolute inset-x-0 -top-4 h-56 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(251,146,60,0.18),transparent)]"
        aria-hidden
      />

      {/* —— Tier 1: greeting + live status —— */}
      <header
        className={`relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${employeePortalRevealClass}`}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-700/90">
            {todayLabel()}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-[2rem] lg:leading-tight">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-slate-600 sm:text-[15px]">
            Punch in, review your week, and manage time off from one place.
          </p>
        </div>
        <div
          className={`inline-flex shrink-0 items-center gap-3 rounded-lg border px-4 py-3 shadow-sm ring-1 ${statusMeta.className}`}
          role="status"
          aria-live="polite"
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusMeta.dot} motion-safe:animate-pulse`} />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide">{statusMeta.label}</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">{statusMeta.detail}</p>
          </div>
        </div>
      </header>

      {/* —— Tier 2: bento — clock + metrics —— */}
      <div
        className={`relative mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 ${employeePortalRevealClass}`}
        style={{ animationDelay: "80ms" }}
      >
        {/* Primary: time clock */}
        <section
          className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04] lg:col-span-7 xl:col-span-8"
          aria-labelledby="emp-hub-clock-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-orange-50/90 via-white to-white px-4 py-4 sm:px-5">
            <div>
              <h2 id="emp-hub-clock-heading" className="text-base font-bold text-slate-900">
                Time clock
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {selfServe?.viewerEmployeeName?.trim() ?? "You"} ·{" "}
                {selfServe && (selfServe.geofenceActive || selfServe.requireLocationForPunch)
                  ? "GPS required"
                  : "GPS optional"}
              </p>
            </div>
            <Link
              href="/my-punches"
              className="inline-flex items-center gap-1 rounded-lg border border-orange-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
            >
              Punch history
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <div className="p-4 sm:p-5">
            {hub.clockMissingMessage ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
                {hub.clockMissingMessage}
              </div>
            ) : selfServe ? (
              <TimeClockSelfServe {...selfServe} embedded />
            ) : null}
          </div>
        </section>

        {/* Secondary rail: shift + PTO metrics */}
        <div className="grid gap-4 lg:col-span-5 lg:grid-rows-[auto_1fr_auto] xl:col-span-4">
          <HubPanel title="Next shift" subtitle="Upcoming on your roster">
            {nextShift ? (
              <div className="space-y-2">
                <p className="text-lg font-bold leading-snug text-slate-900">
                  {fmtShiftRange(nextShift.shiftStart, nextShift.shiftEnd)}
                </p>
                {nextShift.locationName ? (
                  <p className="text-sm text-slate-600">{nextShift.locationName}</p>
                ) : null}
                {nextShift.notes?.trim() ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-100">
                    {nextShift.notes.trim()}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-slate-600">
                Nothing scheduled yet. Check{" "}
                <Link href="/schedule" className="font-semibold text-orange-700 hover:underline">
                  Schedule
                </Link>{" "}
                or ask your manager.
              </p>
            )}
          </HubPanel>

          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              label="Vacation"
              value={pto.ok ? fmtHours(vacationHours ?? 0) : "—"}
              unit="hrs"
              icon={Palmtree}
              accent="text-orange-700"
            />
            <MetricTile
              label="Sick"
              value={pto.ok ? fmtHours(sickHours ?? 0) : "—"}
              unit="hrs"
              icon={Thermometer}
              accent="text-slate-700"
            />
          </div>

          {!pto.ok ? <p className="text-sm text-red-700">{pto.error}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              type="button"
              disabled={!hub.timeOffLocationId || ptoPending}
              onClick={() => setTimeOffOpen(true)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Request time off
            </button>
            <button
              type="button"
              disabled={ptoPending}
              onClick={() => refreshPto()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCcw className={`h-4 w-4 ${ptoPending ? "animate-spin" : ""}`} aria-hidden />
              {ptoPending ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {!hub.timeOffLocationId ? (
            <p className="text-xs text-amber-800">Assign a home store on your profile to request time off.</p>
          ) : null}
        </div>
      </div>

      {/* —— Tier 3: quick navigation —— */}
      <nav
        className={`relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 ${employeePortalRevealClass}`}
        style={{ animationDelay: "140ms" }}
        aria-label="Shortcuts"
      >
        {quickLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center justify-between rounded-lg border border-slate-200/90 bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-orange-200 hover:shadow-md"
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-700 ring-1 ring-orange-100">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              {label}
            </span>
            <ArrowUpRight
              className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-orange-600"
              aria-hidden
            />
          </Link>
        ))}
      </nav>

      {/* —— Tier 4: ledger —— */}
      <div className={`relative mt-5 ${employeePortalRevealClass}`} style={{ animationDelay: "200ms" }}>
        <PtoLedgerView
          employeeId={employeeId}
          initialEntries={initialLedger}
          initialError={initialLedgerError}
        />
      </div>

      {hub.timeOffLocationId ? (
        <EmployeeTimeOffRequestModal
          open={timeOffOpen}
          onClose={() => setTimeOffOpen(false)}
          locationId={hub.timeOffLocationId}
          employeeId={employeeId}
          onSaved={() => {
            refreshPto();
            router.refresh();
          }}
        />
      ) : null}

      <button
        type="button"
        onClick={() => setTimeOffOpen(true)}
        disabled={!hub.timeOffLocationId}
        aria-haspopup="dialog"
        aria-label="Request time off"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-xl shadow-slate-900/20 transition active:scale-95 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
      >
        <CalendarPlus className="h-6 w-6" aria-hidden />
      </button>
    </div>
  );
}

function HubPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.04] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-800 ring-1 ring-orange-100">
          <CalendarClock className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

function MetricTile({
  label,
  value,
  unit,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  icon: typeof Palmtree;
  accent: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <Icon className={`h-4 w-4 ${accent}`} aria-hidden />
      </div>
      <p className="mt-3 font-mono text-3xl font-bold tabular-nums tracking-tight text-slate-900">
        {value}
        <span className="ml-1 text-sm font-semibold text-slate-500">{unit}</span>
      </p>
    </div>
  );
}
