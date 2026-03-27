"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setSelectedLocationId } from "@/app/actions/location";
import type { LocationRow } from "@/lib/dashboard/resolve-location";

type Props = {
  locations: LocationRow[];
  selectedLocationId: string;
};

export function LocationSwitcher({ locations, selectedLocationId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (locations.length === 0) {
    return null;
  }

  return (
    <div className="relative hidden shrink-0 sm:block">
      <label htmlFor="location-switcher" className="sr-only">
        Store location
      </label>
      <select
        id="location-switcher"
        value={selectedLocationId || locations[0].id}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            await setSelectedLocationId(id);
            router.refresh();
          });
        }}
        className="cursor-pointer rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 hover:border-orange-200 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60"
      >
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </select>
    </div>
  );
}
