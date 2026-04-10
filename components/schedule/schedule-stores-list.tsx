"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarRange, Lock, Users } from "lucide-react";
import { setSelectedLocationId } from "@/app/actions/location";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

export type ScheduleStoreCardModel = {
  locationId: string;
  locationName: string;
  /** Active employees at store (preview list). */
  employees: { id: string; fullName: string; role?: string | null }[];
  /** If RBAC is on: only this store’s manager (or owner) can edit. */
  canEdit: boolean;
};

type Props = {
  scopeLabel: string;
  weekParam: string;
  stores: ScheduleStoreCardModel[];
};

export function ScheduleStoresList({ scopeLabel, weekParam, stores }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => {
      if (s.locationName.toLowerCase().includes(q)) return true;
      return s.employees.some(
        (e) => e.fullName.toLowerCase().includes(q) || (e.role ?? "").toLowerCase().includes(q),
      );
    });
  }, [stores, query]);

  const openStore = (locationId: string, opts?: { add?: boolean }) => {
    startTransition(() => {
      void (async () => {
        await setSelectedLocationId(locationId);
        const add = opts?.add ? "&add=1" : "";
        router.push(`/schedule/board?week=${encodeURIComponent(weekParam)}${add}`);
        router.refresh();
      })();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-900 ring-1 ring-orange-200/80">
            <CalendarRange className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Schedule</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Pick a store to open the Connecteam-style week board. Scope:{" "}
              <span className="font-medium text-slate-700">{scopeLabel}</span>
            </p>
          </div>
        </div>
        <Link
          href={`/schedule/board?week=${encodeURIComponent(weekParam)}`}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Open board
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <input
            type="search"
            placeholder="Search store or employee"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            aria-label="Search schedules"
          />
        </div>
        <span className="text-xs text-slate-500">
          <Users className="inline h-4 w-4 -translate-y-px text-slate-400" aria-hidden />{" "}
          {filtered.reduce((n, s) => n + s.employees.length, 0)} employees
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-600">
          No stores match your search.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const preview = s.employees.slice(0, 8);
            const remaining = Math.max(0, s.employees.length - preview.length);
            return (
              <li key={s.locationId} className="h-full">
                <div className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-slate-900">
                        {s.locationName}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {s.employees.length} active employees
                      </p>
                    </div>
                    {!s.canEdit ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600"
                        title="Read-only for this store"
                      >
                        <Lock className="h-3 w-3" aria-hidden />
                        Read-only
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                        Manager
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {preview.map((e) => (
                      <span
                        key={e.id}
                        className="rounded-md bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-950 ring-1 ring-orange-200/60"
                        title={e.role ?? undefined}
                      >
                        {e.fullName}
                      </span>
                    ))}
                    {remaining ? (
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                        +{remaining} more
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 flex flex-1 items-end justify-between gap-2 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      className={`${PRIMARY_ORANGE_CTA} inline-flex flex-1 items-center justify-center px-4 py-2.5 text-sm disabled:opacity-50`}
                      disabled={pending}
                      onClick={() => openStore(s.locationId)}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      disabled={pending || !s.canEdit}
                      title={
                        s.canEdit
                          ? "Add a shift for this store"
                          : "Only this store’s manager can edit"
                      }
                      onClick={() => openStore(s.locationId, { add: true })}
                    >
                      + Shift
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

