"use client";

import { Bell, Search } from "lucide-react";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { LocationSwitcher } from "@/components/dashboard/location-switcher";
import type { LocationRow } from "@/lib/dashboard/resolve-location";

type Props = {
  userEmail: string;
  displayName: string;
  locations: LocationRow[];
  selectedLocationId: string;
  /** Show account menu with log out when a session exists. */
  signedIn?: boolean;
  /** `/users/[id]` when session is linked to an employee row (email match). */
  myProfileHref?: string | null;
  /** Signed in with email but no employee row matches (case-insensitive). */
  profileUnlinked?: boolean;
  /** RBAC: signed in but no employees row for this email */
  rbacProfileHint?: string | null;
};

export function AppHeader({
  userEmail,
  displayName,
  locations,
  selectedLocationId,
  signedIn = false,
  myProfileHref = null,
  profileUnlinked = false,
  rbacProfileHint = null,
}: Props) {
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

        <AccountMenu
          displayName={displayName}
          userEmail={userEmail}
          signedIn={signedIn}
          myProfileHref={myProfileHref}
          profileUnlinked={profileUnlinked}
        />
      </div>
    </header>
  );
}
