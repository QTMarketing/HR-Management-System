"use client";

import { Bell, ChevronDown, Search } from "lucide-react";
import { LocationSwitcher } from "@/components/dashboard/location-switcher";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import type { LocationRow } from "@/lib/dashboard/resolve-location";

type Props = {
  userEmail: string;
  displayName: string;
  locations: LocationRow[];
  selectedLocationId: string;
  /** Hidden when no one is signed in (auth disabled / anon browsing). */
  showSignOut?: boolean;
  /** RBAC: signed in but no employees row for this email */
  rbacProfileHint?: string | null;
};

export function AppHeader({
  userEmail,
  displayName,
  locations,
  selectedLocationId,
  showSignOut = false,
  rbacProfileHint = null,
}: Props) {
  const initial = displayName.charAt(0).toUpperCase() || userEmail.charAt(0).toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white">
      {rbacProfileHint ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 sm:text-sm">
          {rbacProfileHint}
        </div>
      ) : null}
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8 sm:gap-4">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search employees, schedules…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
            aria-label="Global search"
          />
        </div>

        <LocationSwitcher locations={locations} selectedLocationId={selectedLocationId} />

        <button
          type="button"
          className="relative shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title={userEmail || undefined}
            className="flex items-center gap-2 rounded-lg py-1.5 pl-1 pr-2 hover:bg-slate-50"
            aria-label="Account menu"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-xs font-semibold text-white shadow-sm">
              {initial}
            </span>
            <span className="hidden max-w-[140px] truncate text-left text-sm font-medium text-slate-800 md:block">
              {displayName}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
          </button>
          {showSignOut ? <SignOutButton /> : null}
        </div>
      </div>
    </header>
  );
}
