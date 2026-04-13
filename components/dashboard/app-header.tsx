"use client";

import { Search } from "lucide-react";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { LocationSwitcher } from "@/components/dashboard/location-switcher";
import { NotificationMenu } from "@/components/dashboard/notification-menu";
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
  pendingTimeOffCount?: number;
  canManageTimeOff?: boolean;
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
  pendingTimeOffCount = 0,
  canManageTimeOff = false,
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

        <NotificationMenu
          pendingTimeOffCount={pendingTimeOffCount}
          canManageTimeOff={canManageTimeOff}
        />

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
