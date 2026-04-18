"use client";

import { Plus, Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { setLocationStatus, type LocationStatus } from "@/app/actions/location-status";
import { updateLocationStoreManager } from "@/app/actions/location-manager";
import { AddStoreModal } from "@/components/locations/add-store-modal";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { bucketForEmployee, displayFirst, displayLast } from "@/lib/users/directory-buckets";
import type { DirectoryEmployee } from "@/lib/users/directory-buckets";

export type LocationRowIn = {
  id: string;
  name: string;
  manager_employee_id: string | null;
  status?: LocationStatus | null;
};

type Props = {
  locations: LocationRowIn[];
  employees: DirectoryEmployee[];
  canManageStores: boolean;
};

type StoreTab = "all" | "running" | "not_running";

export function StoreDirectoryClient({ locations, employees, canManageStores }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<StoreTab>("all");
  const [addStoreOpen, setAddStoreOpen] = useState(false);

  const active = useMemo(
    () => employees.filter((e) => bucketForEmployee(e) !== "archived"),
    [employees],
  );

  const counts = useMemo(() => {
    const rows = locations.filter((l) => (l.status ?? "running") !== "archived");
    const running = rows.filter((l) => (l.status ?? "running") === "running").length;
    const notRunning = rows.filter((l) => (l.status ?? "running") === "not_running").length;
    return { total: rows.length, running, notRunning };
  }, [locations]);

  const filteredLocations = useMemo(() => {
    const rows = locations.filter((l) => (l.status ?? "running") !== "archived");
    if (tab === "running") return rows.filter((l) => (l.status ?? "running") === "running");
    if (tab === "not_running") return rows.filter((l) => (l.status ?? "running") === "not_running");
    return rows;
  }, [locations, tab]);

  const managersByLocation = useMemo(() => {
    const m = new Map<string, { id: string; label: string }[]>();
    for (const loc of locations) {
      const list = active
        .filter(
          (e) =>
            e.location_id === loc.id && normalizeRoleLabel(e.role) === "store_manager",
        )
        .map((e) => ({
          id: e.id,
          label:
            `${displayFirst(e)} ${displayLast(e)}`.replace(/\s+/g, " ").trim() || e.full_name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      m.set(loc.id, list);
    }
    return m;
  }, [active, locations]);

  const tileBase =
    "rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors";
  const tileOn = "border-orange-300 bg-orange-50/60";

  return (
    <div className="space-y-4">
      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-3 gap-2 sm:max-w-xl sm:flex-1">
          <button
            type="button"
            className={`${tileBase} ${tab === "all" ? tileOn : ""}`}
            onClick={() => setTab("all")}
            disabled={pending}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total stores
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {String(counts.total)}
            </div>
          </button>
          <button
            type="button"
            className={`${tileBase} ${tab === "running" ? tileOn : ""}`}
            onClick={() => setTab("running")}
            disabled={pending}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Running
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {String(counts.running)}
            </div>
          </button>
          <button
            type="button"
            className={`${tileBase} ${tab === "not_running" ? tileOn : ""}`}
            onClick={() => setTab("not_running")}
            disabled={pending}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Not running
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {String(counts.notRunning)}
            </div>
          </button>
        </div>

        {canManageStores ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:opacity-50"
            onClick={() => setAddStoreOpen(true)}
            disabled={pending}
            title="Create store"
          >
            <Plus className="h-4 w-4" />
            Add store
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[920px] w-full table-auto text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="whitespace-nowrap px-4 py-3">Store</th>
              <th className="whitespace-nowrap px-4 py-3">Status</th>
              <th className="whitespace-nowrap px-4 py-3">Store lead (Store Manager)</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-slate-800">
            {filteredLocations.map((loc, i) => {
              const options = managersByLocation.get(loc.id) ?? [];
              const status = (loc.status ?? "running") as LocationStatus;
              return (
                <tr
                  key={loc.id}
                  className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`}
                >
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{loc.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {canManageStores ? (
                      <select
                        className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50"
                        disabled={pending}
                        value={status}
                        onChange={(ev) => {
                          const next = ev.target.value as LocationStatus;
                          setError(null);
                          startTransition(async () => {
                            const r = await setLocationStatus(loc.id, next);
                            if (!r.ok) {
                              setError(r.error);
                              return;
                            }
                            router.refresh();
                          });
                        }}
                        aria-label="Store status"
                        title="Set store running status"
                      >
                        <option value="running">Running</option>
                        <option value="not_running">Not running</option>
                      </select>
                    ) : (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          status === "running"
                            ? "bg-emerald-50 text-emerald-800"
                            : status === "not_running"
                              ? "bg-amber-50 text-amber-900"
                              : "bg-slate-100 text-slate-700"
                        }`}
                        title={status}
                      >
                        {status === "running"
                          ? "Running"
                          : status === "not_running"
                            ? "Not running"
                            : "Archived"}
                      </span>
                    )}
                  </td>
                  <td className="min-w-0 px-4 py-3 align-middle">
                    {canManageStores ? (
                      <select
                        className="max-w-md w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50"
                        disabled={pending}
                        value={loc.manager_employee_id ?? ""}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          setError(null);
                          startTransition(async () => {
                            const r = await updateLocationStoreManager(
                              loc.id,
                              v === "" ? null : v,
                            );
                            if (!r.ok) {
                              setError(r.error);
                              return;
                            }
                            router.refresh();
                          });
                        }}
                      >
                        <option value="">— None —</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="block max-w-md truncate text-slate-600"
                        title={
                          loc.manager_employee_id
                            ? options.find((o) => o.id === loc.manager_employee_id)?.label ??
                              "Assigned"
                            : "—"
                        }
                      >
                        {loc.manager_employee_id
                          ? options.find((o) => o.id === loc.manager_employee_id)?.label ??
                            "Assigned"
                          : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    {canManageStores && status === "not_running" ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        title="Archive store"
                        onClick={() => {
                          setError(null);
                          startTransition(async () => {
                            const r = await setLocationStatus(loc.id, "archived");
                            if (!r.ok) {
                              setError(r.error);
                              return;
                            }
                            router.refresh();
                          });
                        }}
                      >
                        <Archive className="h-4 w-4 text-slate-500" />
                        Archive
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!canManageStores ? (
        <p className="text-xs text-slate-500">
          Only admins and organization owners can manage stores when RBAC is enabled.
        </p>
      ) : null}

      <AddStoreModal
        open={addStoreOpen}
        onOpenChange={setAddStoreOpen}
        employees={employees}
        canManageStores={canManageStores}
      />
    </div>
  );
}
