"use client";

import Link from "next/link";
import { PunchTimeDisplay } from "@/components/time-clock/punch-time-display";
import type { MyPunchRow } from "@/lib/employee/load-my-punches";

function punchDurationMinutes(clockIn: string, clockOut: string | null): string {
  if (!clockOut) return "In progress";
  const a = new Date(clockIn).getTime();
  const b = new Date(clockOut).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "—";
  const mins = Math.round((b - a) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type Props = {
  rows: MyPunchRow[];
  rangeLabel: string;
  error?: string | null;
};

export function MyPunchesList({ rows, rangeLabel, error }: Props) {
  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-900">No punches in this period</p>
        <p className="mt-1 text-sm text-slate-600">
          Clock in from{" "}
          <Link href="/" className="font-semibold text-orange-700 underline-offset-2 hover:underline">
            Home
          </Link>{" "}
          and your shifts will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{rangeLabel}</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{dayLabel(r.clockInAt)}</p>
                {r.storeName ? (
                  <p className="mt-0.5 text-xs text-slate-500">{r.storeName}</p>
                ) : null}
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {r.status === "open" ? "On shift" : r.status}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  In
                </dt>
                <dd className="mt-0.5 font-medium text-slate-900">
                  <PunchTimeDisplay iso={r.clockInAt} variant="time" />
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Out
                </dt>
                <dd className="mt-0.5 font-medium text-slate-900">
                  <PunchTimeDisplay iso={r.clockOutAt} variant="time" fallback="—" />
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Worked:</span>{" "}
              {punchDurationMinutes(r.clockInAt, r.clockOutAt)}
              {r.jobCode ? (
                <>
                  {" "}
                  · <span className="font-semibold text-slate-800">Job:</span> {r.jobCode}
                </>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
