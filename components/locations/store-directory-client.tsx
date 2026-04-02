"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateLocationStoreManager } from "@/app/actions/location-manager";
import { EllipsisTd } from "@/components/ui/ellipsis-td";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { bucketForEmployee, displayFirst, displayLast } from "@/lib/users/directory-buckets";
import type { DirectoryEmployee } from "@/lib/users/directory-buckets";

export type LocationRowIn = {
  id: string;
  name: string;
  manager_employee_id: string | null;
};

type Props = {
  locations: LocationRowIn[];
  employees: DirectoryEmployee[];
  canAssignStoreLead: boolean;
};

export function StoreDirectoryClient({ locations, employees, canAssignStoreLead }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(
    () => employees.filter((e) => bucketForEmployee(e) !== "archived"),
    [employees],
  );

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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[720px] w-full table-auto text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="whitespace-nowrap px-4 py-3">Store</th>
              <th className="whitespace-nowrap px-4 py-3">Store lead (Store Manager)</th>
            </tr>
          </thead>
          <tbody className="text-slate-800">
            {locations.map((loc, i) => {
              const options = managersByLocation.get(loc.id) ?? [];
              return (
                <tr
                  key={loc.id}
                  className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`}
                >
                  <EllipsisTd
                    maxClass="max-w-[22rem]"
                    title={loc.name}
                    className="font-medium text-slate-900"
                  >
                    {loc.name}
                  </EllipsisTd>
                  <td className="min-w-0 px-4 py-3 align-middle">
                    {canAssignStoreLead ? (
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!canAssignStoreLead ? (
        <p className="text-xs text-slate-500">
          Only organization owners can change store lead assignments when RBAC is enabled.
        </p>
      ) : null}
    </div>
  );
}
