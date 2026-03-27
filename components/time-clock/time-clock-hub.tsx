"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

export type HubClock = {
  id: string;
  name: string;
  status: "active" | "archived";
  /** When the header is "All locations", which store this clock belongs to. */
  storeName?: string | null;
  /** Active employees at that store (for the Assigned line when `storeName` is set). */
  employeesAtStore?: number;
};

type Props = {
  locationName: string;
  activeClocks: HubClock[];
  archivedClocks: HubClock[];
  employeeCount: number;
  errorMessage: string | null;
};

export function TimeClockHub({
  locationName,
  activeClocks,
  archivedClocks,
  employeeCount,
  errorMessage,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const tab = searchParams.get("tab") === "archived" ? "archived" : "active";

  const setTab = useCallback(
    (next: "active" | "archived") => {
      startTransition(() => {
        const q = new URLSearchParams(searchParams.toString());
        if (next === "archived") {
          q.set("tab", "archived");
        } else {
          q.delete("tab");
        }
        const suffix = q.toString();
        router.push(suffix ? `/time-clock?${suffix}` : "/time-clock");
      });
    },
    [router, searchParams],
  );

  const list = tab === "active" ? activeClocks : archivedClocks;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Time clock</h1>
        <p className="mt-1 text-sm text-slate-500">
          Scope: <span className="font-medium text-slate-700">{locationName}</span> — pick a clock,
          then open it for Today / Timesheets (Connecteam-style).
        </p>
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {errorMessage}
        </p>
      ) : null}

      <div className="border-b border-slate-200">
        <nav className="flex gap-6" aria-label="Time clock folders">
          <button
            type="button"
            disabled={pending}
            onClick={() => setTab("active")}
            className={`border-b-2 pb-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              tab === "active"
                ? "border-orange-500 text-orange-950"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Active ({activeClocks.length})
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setTab("archived")}
            className={`border-b-2 pb-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              tab === "archived"
                ? "border-orange-500 text-orange-950"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Archived ({archivedClocks.length})
          </button>
        </nav>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center text-sm text-slate-600">
          {tab === "archived"
            ? "No archived time clocks for this store. Archived clocks stay here for history without appearing in day-to-day use."
            : "No active time clocks yet. Run database migrations through 007, or add a clock in Supabase (time_clocks table)."}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <li key={c.id}>
              <div className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-800">{c.name}</h2>
                <p className="mt-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-600">Assigned:</span>{" "}
                  <span className="rounded-md bg-orange-50 px-2 py-0.5 text-orange-950">
                    {c.storeName != null && c.employeesAtStore != null
                      ? `All employees at ${c.storeName} (${c.employeesAtStore})`
                      : `All employees at this store (${employeeCount})`}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Status:{" "}
                  <span className="font-medium text-slate-600">
                    {c.status === "active" ? "Active" : "Archived"}
                  </span>
                </p>
                <div className="mt-4 flex flex-1 items-end gap-2">
                  {c.status === "active" ? (
                    <Link
                      href={`/time-clock/${c.id}`}
                      className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-orange-700 shadow-sm hover:bg-slate-50"
                    >
                      Access
                    </Link>
                  ) : (
                    <Link
                      href={`/time-clock/${c.id}?view=timesheets`}
                      className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      View history
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
