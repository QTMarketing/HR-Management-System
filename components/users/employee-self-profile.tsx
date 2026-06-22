"use client";

import { ArrowLeft, Briefcase, Calendar, Mail, MapPin, Phone, UserRound } from "lucide-react";
import Link from "next/link";

type Props = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  mobilePhone: string;
  role: string;
  storeName: string | null;
  managerName: string | null;
  employmentStartDate: string | null;
  vacationHours: number | null;
  sickHours: number | null;
};

function fmtDate(iso: string | null): string {
  if (!iso?.trim()) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value || "—"}</dd>
    </div>
  );
}

export function EmployeeSelfProfile({
  firstName,
  lastName,
  fullName,
  email,
  mobilePhone,
  role,
  storeName,
  managerName,
  employmentStartDate,
  vacationHours,
  sickHours,
}: Props) {
  const initials = (() => {
    const a = firstName.trim()[0] ?? "";
    const b = lastName.trim()[0] ?? "";
    const combined = `${a}${b}`.toUpperCase();
    if (combined) return combined;
    return email.trim()[0]?.toUpperCase() ?? "?";
  })();

  return (
    <div className="space-y-6 pb-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-orange-800 hover:text-orange-950"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Home
      </Link>

      <div className="rounded-lg border border-slate-200/90 bg-gradient-to-br from-orange-50 via-white to-white p-5 shadow-sm ring-1 ring-slate-900/[0.04] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 text-2xl font-bold text-white shadow-md sm:h-20 sm:w-20"
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{fullName}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {storeName ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-slate-200">
                  <MapPin className="h-3.5 w-3.5 text-orange-600" aria-hidden />
                  {storeName}
                </span>
              ) : null}
              {role ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                  <Briefcase className="h-3.5 w-3.5" aria-hidden />
                  {role}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Your work details. Contact HR if something needs to change.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.04]">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Phone className="h-4 w-4 text-orange-600" aria-hidden />
            <h2 className="text-sm font-bold text-slate-900">Contact</h2>
          </div>
          <dl className="mt-1">
            <ReadRow label="Email" value={email} />
            <ReadRow label="Mobile phone" value={mobilePhone} />
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.04]">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Briefcase className="h-4 w-4 text-orange-600" aria-hidden />
            <h2 className="text-sm font-bold text-slate-900">Work</h2>
          </div>
          <dl className="mt-1">
            <ReadRow label="Position" value={role} />
            <ReadRow label="Store" value={storeName ?? ""} />
            <ReadRow label="Direct manager" value={managerName ?? ""} />
            <ReadRow label="Start date" value={fmtDate(employmentStartDate)} />
          </dl>
        </section>
      </div>

      {(vacationHours !== null || sickHours !== null) && (
        <section className="rounded-lg border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.04]">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Calendar className="h-4 w-4 text-orange-600" aria-hidden />
            <h2 className="text-sm font-bold text-slate-900">Time off balances</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vacation</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {vacationHours !== null ? vacationHours.toFixed(1) : "—"}
                <span className="ml-1 text-sm font-semibold text-slate-500">hrs</span>
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sick</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {sickHours !== null ? sickHours.toFixed(1) : "—"}
                <span className="ml-1 text-sm font-semibold text-slate-500">hrs</span>
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Request time off from{" "}
            <Link href="/" className="font-semibold text-orange-700 hover:underline">
              Home
            </Link>
            .
          </p>
        </section>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span>
          Need to update your phone, email, or store? Ask your manager or HR — those changes are
          handled by your team, not in this app.
        </span>
      </p>
    </div>
  );
}
