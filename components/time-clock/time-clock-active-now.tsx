"use client";

import type { EnrichedPunchRow } from "@/lib/time-clock/types";

type Props = {
  rows: EnrichedPunchRow[];
};

/**
 * Lists people currently clocked in (open punches). Matches the “Clocked in now” KPI count.
 * Clock-out is performed by the employee on the shared kiosk / employee app — not from this dashboard.
 */
export function TimeClockActiveNow({ rows }: Props) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Clocked in now
        </h3>
        <span className="text-xs tabular-nums text-slate-500">
          {rows.length} {rows.length === 1 ? "person" : "people"}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        To clock out, team members use this store&apos;s Time Clock or their usual app. Managers can
        review or archive entries here when needed.
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No one is clocked in on this clock right now.</p>
      ) : (
        <ul className="mt-3 space-y-2" aria-label="Employees currently clocked in">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-emerald-100 text-xs font-semibold text-emerald-950"
                  aria-hidden
                >
                  {r.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{r.employeeName}</p>
                  <p className="text-xs text-slate-600">
                    Since <span className="tabular-nums">{r.clockInDisplay}</span>
                    <span className="text-slate-400"> · </span>
                    {r.employeeRole}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
