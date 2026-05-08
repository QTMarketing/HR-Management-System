"use client";

import {
  CalendarDays,
  ChevronDown,
  Download,
  Plane,
  RotateCw,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { HrTimeOffLedgerCsvRow } from "@/lib/csv/hr-ledger-csv";
import { buildHrTimeOffLedgerCsv } from "@/lib/csv/hr-ledger-csv";
import type { PtoBucket, PtoPolicySummary } from "@/app/actions/pto-policy";
import { PtoPolicyDrawer } from "@/components/time-off/pto-policy-drawer";

type Props = {
  rows: HrTimeOffLedgerCsvRow[];
  year: number;
  thisYear: number;
  locationName: string;
  scopeAll: boolean;
  /** "all" or a location uuid; reserved for future location filtering. */
  locationId: string;
  /** PTO policy summary; null when no policy row exists yet. */
  policy: PtoPolicySummary | null;
  /** When true, show the Vacation/Sick policy editor buttons. */
  canEditPolicy: boolean;
};

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fmtHrs(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(2).replace(/\.00$/, "");
}

/**
 * "Active Since" formatter. Accepts both date-only strings
 * (`employment_start_date`, e.g. "2023-04-12") and full ISO timestamps
 * (`rehired_at`, e.g. "2026-05-08T13:42:00Z"). Returns "—" when missing /
 * unparseable so the column never renders raw nulls.
 */
function fmtActiveSince(value: string | null | undefined): string {
  if (!value) return "—";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  // Anchor date-only strings at noon local to avoid the "Apr 11" vs "Apr 12"
  // off-by-one that hits when you parse "YYYY-MM-DD" as midnight UTC and then
  // format in a western timezone.
  const d = isDateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function safeFilenamePart(s: string): string {
  return s.trim().replaceAll(/[^\w\- ]+/g, "").replaceAll(/\s+/g, "_");
}

export function TimeOffLedgerClient({
  rows,
  year,
  thisYear,
  locationName,
  scopeAll,
  locationId,
  policy,
  canEditPolicy,
}: Props) {
  const router = useRouter();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, startExport] = useTransition();
  const [drawerBucket, setDrawerBucket] = useState<PtoBucket | null>(null);

  // Debounce search to keep the UI responsive on large rosters.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.storeLocation.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const hasActiveFilter = searchInput.trim().length > 0 || year !== thisYear;

  const showVacation = true;
  const showSick = true;

  const setYearInUrl = (y: number) => {
    const params = new URLSearchParams(window.location.search);
    if (y === thisYear) params.delete("year");
    else params.set("year", String(y));
    const qs = params.toString();
    router.push(qs ? `/time-off?${qs}` : "/time-off");
  };

  const clearAll = () => {
    setSearchInput("");
    if (year !== thisYear) setYearInUrl(thisYear);
  };

  const onExport = () => {
    startExport(async () => {
      const csv = buildHrTimeOffLedgerCsv(rows);
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      const locPart = safeFilenamePart(locationName) || "Store";
      downloadTextFile(`time_off_ledger_${locPart}_${year}_${y}-${m}-${d}.csv`, csv);
    });
  };

  // Toolbar styles (enterprise pill).
  const pillBase =
    "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/20";
  const pillIdle = "border-slate-200 bg-white text-slate-900 hover:bg-slate-50";
  const pillActive = "border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100/60";

  return (
    <div className="space-y-5">
      <div className="flex w-full flex-wrap items-start justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-full min-w-[240px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search employees…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {searchInput.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>

          {/* Year pill (drives URL → server refetch) */}
          <div className="relative">
            <span className={`${pillBase} ${year !== thisYear ? pillActive : pillIdle}`}>
              <CalendarDays className="h-4 w-4 opacity-70" aria-hidden />
              Year: {year}
              <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
            </span>
            <select
              value={year}
              onChange={(e) => setYearInUrl(Number(e.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Select year"
            >
              {Array.from({ length: 7 }, (_, i) => thisYear - 3 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilter ? (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              Clear all
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEditPolicy && policy ? (
            <>
              <button
                type="button"
                onClick={() => setDrawerBucket("vacation")}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              >
                <Plane className="h-4 w-4 text-orange-500" aria-hidden />
                Vacation policy
              </button>
              <button
                type="button"
                onClick={() => setDrawerBucket("sick")}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              >
                <Stethoscope className="h-4 w-4 text-emerald-600" aria-hidden />
                Sick policy
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={onExport}
            disabled={exporting || rows.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export to CSV
          </button>
        </div>
      </div>

      <LedgerTable
        rows={filteredRows}
        scopeAll={scopeAll}
        showVacation={showVacation}
        showSick={showSick}
        year={year}
        totalRows={rows.length}
      />

      {/* Reserved: keeps `locationId` in scope for future location-aware exports. */}
      <span className="hidden" data-location-id={locationId} />

      {policy && drawerBucket ? (
        <PtoPolicyDrawer
          open={drawerBucket !== null}
          bucket={drawerBucket}
          policy={policy}
          onClose={() => {
            setDrawerBucket(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function LedgerTable({
  rows,
  scopeAll,
  showVacation,
  showSick,
  year,
  totalRows,
}: {
  rows: HrTimeOffLedgerCsvRow[];
  scopeAll: boolean;
  showVacation: boolean;
  showSick: boolean;
  year: number;
  totalRows: number;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Employees</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            How many days each person has used and how many they still have left in {year}.{" "}
            {scopeAll ? "Showing all stores." : "Showing this store only."}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {rows.length} of {totalRows}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No employees match the current filters.
        </p>
      ) : (
        <div className="w-full">
          <table className="w-full table-auto border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="w-[26%] whitespace-nowrap py-2 pl-5 pr-3">Employee</th>
                {scopeAll ? (
                  <th className="w-[12%] whitespace-nowrap py-2 pr-3">Store</th>
                ) : null}
                <th className="w-[14%] whitespace-nowrap py-2 pr-3">Active Since</th>
                {showVacation ? (
                  <th
                    className="whitespace-nowrap border-l border-slate-200 py-2 pl-3 pr-3 text-center"
                    colSpan={3}
                  >
                    <span className="block text-[11px] uppercase text-slate-500">
                      Vacation
                    </span>
                  </th>
                ) : null}
                {showSick ? (
                  <th
                    className="whitespace-nowrap border-l border-slate-200 py-2 pl-3 pr-3 text-center"
                    colSpan={3}
                  >
                    <span className="block text-[11px] uppercase text-slate-500">
                      Sick
                    </span>
                  </th>
                ) : null}
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pl-5 pr-3" />
                {scopeAll ? <th className="py-1.5 pr-3" /> : null}
                <th className="py-1.5 pr-3" />
                {showVacation ? (
                  <>
                    <th className="border-l border-slate-200 py-1.5 pl-3 pr-2 text-right">Total</th>
                    <th className="py-1.5 pr-2 text-right">Used</th>
                    <th className="py-1.5 pr-4 text-right">Balance</th>
                  </>
                ) : null}
                {showSick ? (
                  <>
                    <th className="border-l border-slate-200 py-1.5 pl-3 pr-2 text-right">Total</th>
                    <th className="py-1.5 pr-2 text-right">Used</th>
                    <th className="py-1.5 pr-4 text-right">Balance</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {rows.map((r) => {
                const key = r.employeeId ?? `${r.storeLocation}:${r.employeeName}`;
                return (
                  <tr key={key} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                    <td className="py-1.5 pl-5 pr-3">
                      {r.employeeId ? (
                        <Link
                          href={`/users/${r.employeeId}`}
                          className="font-semibold text-slate-900 hover:text-blue-700"
                          title={r.employeeName}
                        >
                          {r.employeeName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-900">{r.employeeName}</span>
                      )}
                    </td>
                    {scopeAll ? (
                      <td className="py-1.5 pr-3 text-slate-600">{r.storeLocation}</td>
                    ) : null}
                    <td className="py-1.5 pr-3 text-slate-700">
                      <ActiveSinceCell
                        employmentStartDate={r.employmentStartDate ?? null}
                        rehiredAt={r.rehiredAt ?? null}
                      />
                    </td>
                    {showVacation ? (
                      <>
                        <td className="border-l border-slate-100 py-1.5 pl-3 pr-2 text-right tabular-nums">
                          {fmtHrs(r.totalVacationHrs)} h
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {fmtHrs(r.usedVacationHrs)} h
                        </td>
                        <td className="py-1.5 pr-4 text-right font-bold tabular-nums text-slate-900">
                          {fmtHrs(r.remainingVacationHrs)} h
                        </td>
                      </>
                    ) : null}
                    {showSick ? (
                      <>
                        <td className="border-l border-slate-100 py-1.5 pl-3 pr-2 text-right tabular-nums">
                          {fmtHrs(r.totalSickHrs)} h
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {fmtHrs(r.usedSickHrs)} h
                        </td>
                        <td className="py-1.5 pr-4 text-right font-bold tabular-nums text-slate-900">
                          {fmtHrs(r.remainingSickHrs)} h
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Renders the "Active Since" cell. Prefers `rehiredAt` (boomerang employees)
 * and decorates the date with a small "Rehired" pill so HR can see at a glance
 * that the displayed date is a return-to-work, not the original tenure start.
 * Falls back to `employmentStartDate`. Shows "—" when both are missing.
 */
function ActiveSinceCell({
  employmentStartDate,
  rehiredAt,
}: {
  employmentStartDate: string | null;
  rehiredAt: string | null;
}) {
  if (rehiredAt) {
    const original = fmtActiveSince(employmentStartDate);
    const titleText =
      original === "—"
        ? "Rehired — this employee was previously archived and restored."
        : `Rehired — original start date was ${original}.`;
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="tabular-nums">{fmtActiveSince(rehiredAt)}</span>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200/80"
          title={titleText}
          aria-label={titleText}
        >
          <RotateCw className="h-3 w-3" aria-hidden />
          Rehired
        </span>
      </span>
    );
  }
  return <span className="tabular-nums">{fmtActiveSince(employmentStartDate)}</span>;
}
