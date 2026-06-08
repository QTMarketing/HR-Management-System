"use client";

import { AccountMenu } from "@/components/dashboard/account-menu";
import {
  NotificationBell,
  type NotificationBellItem,
} from "@/components/layout/notification-bell";

type Props = {
  userEmail: string;
  displayName: string;
  signedIn?: boolean;
  myProfileHref?: string | null;
  profileUnlinked?: boolean;
  rbacProfileHint?: string | null;
  notifications?: NotificationBellItem[];
  unreadNotificationCount?: number;
};

/** Simplified top bar for frontline employees (no store picker or global search). */
export function EmployeePortalHeader({
  userEmail,
  displayName,
  signedIn = false,
  myProfileHref = null,
  profileUnlinked = false,
  rbacProfileHint = null,
  notifications = [],
  unreadNotificationCount = 0,
}: Props) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white">
      {rbacProfileHint ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 sm:text-sm">
          {rbacProfileHint}
        </div>
      ) : null}
      <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between gap-3 px-4 sm:max-w-3xl sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-bold text-white shadow-sm">
            HR
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="text-[11px] text-slate-500">My work</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <NotificationBell
            initialNotifications={notifications}
            initialUnreadCount={unreadNotificationCount}
          />
          <AccountMenu
            displayName={displayName}
            userEmail={userEmail}
            signedIn={signedIn}
            myProfileHref={myProfileHref}
            profileUnlinked={profileUnlinked}
          />
        </div>
      </div>
    </header>
  );
}
