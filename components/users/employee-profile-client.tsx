"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  type EmployeeProfilePayload,
  updateEmployeeProfile,
} from "@/app/actions/employee-profile";
import { archiveEmployee, restoreEmployee } from "@/app/actions/archive-employee";
import { setEmployeeOrgOwner } from "@/app/actions/org-owner-role";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";
import { POSITION_ROLE_OPTIONS } from "@/lib/users/position-options";

export type ProfileLocationOption = { id: string; name: string };

export type ProfileManagerOption = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  location_id: string | null;
};

export type EmployeeProfileInitial = {
  id: string;
  first_name: string;
  last_name: string;
  mobile_phone: string;
  email: string;
  employment_start_date: string;
  fte: string;
  standard_hours_per_week: string;
  role: string;
  location_id: string;
  direct_manager_id: string;
  birth_date: string;
  employee_code: string;
  kiosk_code: string;
};

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function fmtDisplayDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

type Props = {
  initial: EmployeeProfileInitial;
  locations: ProfileLocationOption[];
  storeManagers: ProfileManagerOption[];
  groupNames: string[];
  canEdit: boolean;
  ptoPanel?: {
    vacationHours: number;
    sickHours: number;
    standardDayHours: number;
    vacationCashoutEnabled: boolean;
    nextVacationCashoutAt: string | null;
    nextVacationCashoutHours: number;
    lastVacationCashoutAt: string | null;
    lastVacationCashoutHours: number;
    ytdVacationUsedHours: number;
    ledger: {
      id: string;
      bucket: string;
      entry_type: string;
      amount_hours: number;
      effective_at: string;
      notes: string | null;
      metadata: unknown;
    }[];
  } | null;
  /** User management: archive this profile (no hard delete). */
  canArchiveUser?: boolean;
  isArchivedProfile?: boolean;
  /** Owners can grant/remove organization owner on this profile. */
  canSetOrgOwner?: boolean;
  isOrgOwner?: boolean;
  appUserIdDisplay: string;
  daysInSystem: number | null;
  addedViaLabel: string;
  lastLogin: string | null;
  /** Set when the row is currently archived. Used by the Restore confirm copy. */
  archivedAt?: string | null;
  /**
   * Set when an employee was previously archived and later restored ("boomerang").
   * Surfaces under the employment start date so HR can tell tenure apart from
   * the latest return-to-work date. Stays null for everyone who was never archived.
   */
  rehiredAt?: string | null;
};

export function EmployeeProfileClient({
  initial,
  locations,
  storeManagers,
  groupNames,
  canEdit,
  ptoPanel = null,
  canArchiveUser = false,
  isArchivedProfile = false,
  canSetOrgOwner = false,
  isOrgOwner = false,
  appUserIdDisplay,
  daysInSystem,
  addedViaLabel,
  lastLogin,
  archivedAt = null,
  rehiredAt = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [first_name, setFirstName] = useState(initial.first_name);
  const [last_name, setLastName] = useState(initial.last_name);
  const [mobile_phone, setMobilePhone] = useState(initial.mobile_phone);
  const [email, setEmail] = useState(initial.email);
  const [employment_start_date, setEmploymentStart] = useState(
    toInputDate(initial.employment_start_date),
  );
  const [fte, setFte] = useState(initial.fte ?? "1.0");
  const [standard_hours_per_week, setStandardHoursPerWeek] = useState(
    initial.standard_hours_per_week ?? "",
  );
  const [role, setRole] = useState(initial.role || "Employee");
  const [location_id, setLocationId] = useState(initial.location_id);
  const [direct_manager_id, setDirectManagerId] = useState(initial.direct_manager_id);
  const [birth_date, setBirthDate] = useState(toInputDate(initial.birth_date));
  const [employee_code, setEmployeeCode] = useState(initial.employee_code);

  const [orgOwnerLocal, setOrgOwnerLocal] = useState(isOrgOwner);
  useEffect(() => {
    setOrgOwnerLocal(isOrgOwner);
  }, [isOrgOwner]);

  const managersForStore = useMemo(
    () =>
      storeManagers.filter(
        (m) => m.location_id && m.location_id === location_id,
      ),
    [storeManagers, location_id],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setMessage(null);
      const payload: EmployeeProfilePayload = {
        first_name,
        last_name,
        mobile_phone,
        email,
        employment_start_date,
        fte,
        standard_hours_per_week,
        role,
        location_id,
        direct_manager_id,
        birth_date,
        employee_code,
      };
      startTransition(async () => {
        const res = await updateEmployeeProfile(initial.id, payload);
        if (res.ok) {
          setMessage({ kind: "ok", text: "Profile saved." });
          router.refresh();
        } else {
          setMessage({ kind: "err", text: res.error });
        }
      });
    },
    [
      initial.id,
      first_name,
      last_name,
      mobile_phone,
      email,
      employment_start_date,
      fte,
      standard_hours_per_week,
      role,
      location_id,
      direct_manager_id,
      birth_date,
      employee_code,
      router,
    ],
  );

  const inputCls =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
  const labelCls = "text-xs font-semibold uppercase tracking-wide text-slate-500";

  const sectionCard =
    "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm";

  const groupCount = groupNames.length;

  const fmtShortDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const ptoTimelineLabel = (t: string) => {
    switch (t) {
      case "annual_grant":
        return "Annual grant";
      case "usage":
        return "Used (time off)";
      case "adjustment":
        return "Adjustment";
      case "forfeit":
        return "Forfeit";
      case "payout":
        return "Payout";
      case "opening_balance":
        return "Opening balance";
      case "termination_payout":
        return "Termination payout";
      case "termination_forfeit":
        return "Termination forfeit";
      default:
        return t.replace(/_/g, " ");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/users"
          className="inline-flex items-center gap-2 text-sm font-medium text-orange-800 hover:text-orange-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>
      </div>

      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {first_name || "—"} {last_name || "—"}
        </h1>
        <p className="text-sm text-slate-500">
          View and update profile details. Company fields use your store list and Store Managers as
          direct reports.
        </p>
      </div>

      {isArchivedProfile ? (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">
            This user is <strong className="font-semibold">archived</strong>
            {archivedAt ? (
              <>
                {" "}
                <span className="text-slate-600">({fmtDisplayDateTime(archivedAt)})</span>
              </>
            ) : null}
            . The record is kept for payroll and audit; it no longer appears in active lists and
            can&apos;t clock in. Edits are disabled while archived.
          </p>
          {canArchiveUser ? (
            <button
              type="button"
              disabled={pending}
              className={`${PRIMARY_ORANGE_CTA} shrink-0 px-3.5 py-2 text-xs disabled:opacity-50`}
              onClick={() => {
                if (
                  !window.confirm(
                    `Restore ${first_name} ${last_name}? They'll move back to active users and be stamped as a rehire (their original employment start date is preserved).`,
                  )
                ) {
                  return;
                }
                setMessage(null);
                startTransition(async () => {
                  const r = await restoreEmployee(initial.id);
                  if (!r.ok) {
                    setMessage({ kind: "err", text: r.error });
                    return;
                  }
                  setMessage({
                    kind: "ok",
                    text: `Welcome back — ${first_name} ${last_name} is active again.`,
                  });
                  router.refresh();
                });
              }}
            >
              {pending ? "Restoring…" : "Restore user (rehire)"}
            </button>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p
          className={`rounded-lg px-4 py-3 text-sm ${
            message.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)_minmax(0,18rem)]">
        <form
          onSubmit={onSubmit}
          className="space-y-6 lg:col-span-1 xl:col-span-2"
          id="employee-profile-form"
        >
          <div className={sectionCard}>
            <h2 className="text-sm font-semibold text-slate-900">Personal Details</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              First name, last name, phone, and email.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <label className={labelCls} htmlFor="first_name">
                  First name
                </label>
                <input
                  id="first_name"
                  className={inputCls}
                  value={first_name}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={!canEdit || pending}
                  autoComplete="given-name"
                />
              </div>
              <div className="sm:col-span-1">
                <label className={labelCls} htmlFor="last_name">
                  Last name
                </label>
                <input
                  id="last_name"
                  className={inputCls}
                  value={last_name}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={!canEdit || pending}
                  autoComplete="family-name"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="mobile_phone">
                  Mobile phone
                </label>
                <input
                  id="mobile_phone"
                  type="tel"
                  className={inputCls}
                  value={mobile_phone}
                  onChange={(e) => setMobilePhone(e.target.value)}
                  disabled={!canEdit || pending}
                  autoComplete="tel"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!canEdit || pending}
                  autoComplete="email"
                />
              </div>
            </div>
          </div>

          <div className={sectionCard}>
            <h2 className="text-sm font-semibold text-slate-900">Company Related Info</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Position (job role), store assignment, reporting line, and HR identifiers.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <label className={labelCls} htmlFor="employment_start_date">
                  Employment start date
                </label>
                <input
                  id="employment_start_date"
                  type="date"
                  className={inputCls}
                  value={employment_start_date}
                  onChange={(e) => setEmploymentStart(e.target.value)}
                  disabled={!canEdit || pending}
                />
                {rehiredAt ? (
                  <p
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200/80"
                    title="This employee was archived and later restored. The original start date above is preserved."
                  >
                    <span aria-hidden>↩</span>
                    Rehired: {fmtDisplayDateTime(rehiredAt)}
                  </p>
                ) : null}
              </div>
              <div className="sm:col-span-1">
                <label className={labelCls} htmlFor="birth_date">
                  Birthday
                </label>
                <input
                  id="birth_date"
                  type="date"
                  className={inputCls}
                  value={birth_date}
                  onChange={(e) => setBirthDate(e.target.value)}
                  disabled={!canEdit || pending}
                />
              </div>
              <div className="sm:col-span-1">
                <label className={labelCls} htmlFor="employment_type">
                  Employment Type
                </label>
                <select
                  id="employment_type"
                  className={inputCls}
                  value={Number(fte) >= 0.75 ? "full" : "half"}
                  onChange={(e) => setFte(e.target.value === "full" ? "1.0" : "0.5")}
                  disabled={!canEdit || pending}
                >
                  <option value="full">Full time</option>
                  <option value="half">Half time</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Full time maps to 1.0 FTE. Half time maps to 0.5 FTE.
                </p>
              </div>
              <div className="sm:col-span-1">
                <label className={labelCls} htmlFor="standard_hours_per_week">
                  Standard hours / week
                </label>
                <input
                  id="standard_hours_per_week"
                  inputMode="decimal"
                  className={inputCls}
                  value={standard_hours_per_week}
                  onChange={(e) => setStandardHoursPerWeek(e.target.value)}
                  disabled={!canEdit || pending}
                  placeholder="40"
                />
              </div>
              <div className="sm:col-span-1">
                <label className={labelCls} htmlFor="role">
                  Position
                </label>
                <select
                  id="role"
                  className={inputCls}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={!canEdit || pending}
                >
                  {role &&
                  !POSITION_ROLE_OPTIONS.includes(
                    role as (typeof POSITION_ROLE_OPTIONS)[number],
                  ) ? (
                    <option value={role}>{role}</option>
                  ) : null}
                  {POSITION_ROLE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className={labelCls} htmlFor="location_id">
                  Store
                </label>
                <select
                  id="location_id"
                  className={inputCls}
                  value={location_id}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLocationId(next);
                    setDirectManagerId((prev) => {
                      const keep = storeManagers.some(
                        (m) => m.id === prev && m.location_id === next,
                      );
                      return keep ? prev : "";
                    });
                  }}
                  disabled={!canEdit || pending}
                >
                  <option value="">Select store…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="direct_manager_id">
                  Direct manager
                </label>
                <select
                  id="direct_manager_id"
                  className={inputCls}
                  value={direct_manager_id}
                  onChange={(e) => setDirectManagerId(e.target.value)}
                  disabled={!canEdit || pending || !location_id}
                >
                  <option value="">None</option>
                  {managersForStore.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name?.trim() ||
                        [m.first_name, m.last_name].filter(Boolean).join(" ") ||
                        "—"}
                    </option>
                  ))}
                </select>
                {!location_id ? (
                  <p className="mt-1 text-xs text-slate-500">Choose a store first.</p>
                ) : managersForStore.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    No Store Manager assigned to this store yet.
                  </p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="employee_code">
                  Employee ID
                </label>
                <input
                  id="employee_code"
                  className={inputCls}
                  value={employee_code}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  disabled={!canEdit || pending}
                  placeholder="HR / payroll ID"
                />
              </div>
            </div>
          </div>

          {canArchiveUser && !isArchivedProfile ? (
            <div className={sectionCard}>
              <h2 className="text-sm font-semibold text-slate-900">Archive user</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Company policy: people are not deleted from the system. Archiving moves them to the
                <strong className="font-semibold"> Archived </strong>
                tab and blocks time clock and active directory use.
              </p>
              <button
                type="button"
                disabled={pending}
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Archive ${first_name} ${last_name}? They will be moved to Archived users and cannot clock in.`,
                    )
                  ) {
                    return;
                  }
                  setMessage(null);
                  startTransition(async () => {
                    const r = await archiveEmployee(initial.id);
                    if (!r.ok) {
                      setMessage({ kind: "err", text: r.error });
                      return;
                    }
                    setMessage({ kind: "ok", text: "User archived." });
                    router.refresh();
                    router.push("/users?tab=archived");
                  });
                }}
              >
                {pending ? "Archiving…" : "Archive this user"}
              </button>
            </div>
          ) : null}

          {canSetOrgOwner || isOrgOwner ? (
            <div className={sectionCard}>
              <h2 className="text-sm font-semibold text-slate-900">Company owner</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Company owners can promote Store Managers, edit admin access, assign store leads, and
                view the security audit log. Keep at least one company owner at all times.
              </p>
              {canSetOrgOwner ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    checked={orgOwnerLocal}
                    disabled={pending}
                    onChange={() => {
                      const next = !orgOwnerLocal;
                      setMessage(null);
                      startTransition(async () => {
                        const r = await setEmployeeOrgOwner(initial.id, next);
                        if (!r.ok) {
                          setMessage({ kind: "err", text: r.error });
                          return;
                        }
                        setOrgOwnerLocal(next);
                        setRole(next ? "Org Owner" : "Employee");
                        setMessage({
                          kind: "ok",
                          text: next
                            ? "Saved as company owner."
                            : "Company owner removed; role set to Employee.",
                        });
                        router.refresh();
                      });
                    }}
                  />
                  <span className="text-sm text-slate-800">
                    <span className="font-medium">Company owner</span>
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      Full company-level admin access.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="mt-3 text-sm text-slate-700">
                  This person is a <strong className="font-semibold">company owner</strong>. Only
                  company owners can add or remove this access.
                </p>
              )}
            </div>
          ) : null}

          {canEdit ? (
            <div className="flex justify-end">
              <button
                type="submit"
                form="employee-profile-form"
                disabled={pending}
                className={`${PRIMARY_ORANGE_CTA} px-5 py-2.5 text-sm disabled:opacity-60`}
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              You can view this profile, but only users with user-management permission can edit
              fields.
            </p>
          )}
        </form>

        <aside className="space-y-4 lg:col-span-1 xl:col-span-1">
          {ptoPanel ? (
            <div className={sectionCard}>
              <h2 className="text-sm font-semibold text-slate-900">PTO</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Balances and recent PTO activity (ledger).
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Vacation balance
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                    {ptoPanel.vacationHours.toFixed(1)}h
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Sick balance
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                    {ptoPanel.sickHours.toFixed(1)}h
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Next cash-out
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                    {ptoPanel.vacationCashoutEnabled && ptoPanel.nextVacationCashoutAt
                      ? `${ptoPanel.nextVacationCashoutHours.toFixed(1)}h`
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {ptoPanel.vacationCashoutEnabled
                      ? fmtShortDate(ptoPanel.nextVacationCashoutAt)
                      : "Disabled"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Last cash-out
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                    {ptoPanel.lastVacationCashoutAt
                      ? `${ptoPanel.lastVacationCashoutHours.toFixed(1)}h`
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {fmtShortDate(ptoPanel.lastVacationCashoutAt)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    YTD vacation used
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                    {ptoPanel.ytdVacationUsedHours.toFixed(1)}h
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recent ledger entries
                </p>
                {ptoPanel.ledger.length ? (
                  <ul className="mt-2 space-y-2">
                    {ptoPanel.ledger.map((e) => {
                      const amt = Number.isFinite(e.amount_hours) ? e.amount_hours : 0;
                      const sign = amt > 0 ? "+" : "";
                      const tone =
                        amt > 0
                          ? "text-emerald-800"
                          : amt < 0
                            ? "text-red-800"
                            : "text-slate-700";
                      return (
                        <li
                          key={e.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {ptoTimelineLabel(e.entry_type)}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {fmtShortDate(e.effective_at)}{" "}
                              <span className="text-slate-300">·</span>{" "}
                              {e.bucket}
                              {e.notes ? (
                                <>
                                  {" "}
                                  <span className="text-slate-300">·</span>{" "}
                                  {e.notes}
                                </>
                              ) : null}
                            </p>
                          </div>
                          <p className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${tone}`}>
                            {sign}
                            {amt.toFixed(1)}h
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No PTO ledger entries yet.</p>
                )}
              </div>
            </div>
          ) : null}

          <div className={sectionCard}>
            <h2 className="text-sm font-semibold text-slate-900">Groups ({groupCount})</h2>
            {groupNames.length ? (
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-700">
                {groupNames.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Not assigned to smart groups yet.</p>
            )}
          </div>

          <div className={sectionCard}>
            <h2 className="text-sm font-semibold text-slate-900">Usage info</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total number of sessions
                </dt>
                <dd className="mt-0.5 font-mono text-slate-800">—</dd>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Days in the system
                </dt>
                <dd className="mt-0.5 font-mono text-slate-800">
                  {daysInSystem !== null ? String(daysInSystem) : "—"}
                </dd>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Last logged-in
                </dt>
                <dd className="mt-0.5 text-slate-800">{fmtDisplayDateTime(lastLogin)}</dd>
              </div>
            </dl>
          </div>

          <div className={sectionCard}>
            <h2 className="text-sm font-semibold text-slate-900">More info</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Mobile device
                </dt>
                <dd className="mt-0.5 font-mono text-slate-600">—</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Mobile device ID
                </dt>
                <dd className="mt-0.5 font-mono text-slate-600">—</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  OS version
                </dt>
                <dd className="mt-0.5 font-mono text-slate-600">—</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  App version
                </dt>
                <dd className="mt-0.5 font-mono text-slate-600">—</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Kiosk code
                </dt>
                <dd className="mt-0.5 font-mono text-slate-800">{initial.kiosk_code || "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              Device fields are placeholders until mobile telemetry is connected.
            </p>
          </div>

          <div className={sectionCard}>
            <h2 className="text-sm font-semibold text-slate-900">Account</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Connecteam User ID
                </dt>
                <dd className="mt-0.5 font-mono text-slate-800">{appUserIdDisplay}</dd>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Added via
                </dt>
                <dd className="mt-0.5 text-slate-800">{addedViaLabel}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
