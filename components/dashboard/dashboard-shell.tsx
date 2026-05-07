"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { AppHeader } from "@/components/dashboard/app-header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { DashboardNavList, type DashboardNavItem } from "@/components/dashboard/dashboard-nav-list";
import { SidebarAccountFooter } from "@/components/dashboard/sidebar-account-footer";
import type { NotificationBellItem } from "@/components/layout/notification-bell";
import type { LocationRow } from "@/lib/dashboard/resolve-location";

type HeaderProps = {
  userEmail: string;
  displayName: string;
  locations: LocationRow[];
  selectedLocationId: string;
  signedIn?: boolean;
  myProfileHref?: string | null;
  profileUnlinked?: boolean;
  rbacProfileHint?: string | null;
  pendingTimeOffCount?: number;
  canManageTimeOff?: boolean;
  notifications?: NotificationBellItem[];
  unreadNotificationCount?: number;
};

type Props = {
  children: ReactNode;
  navItems: DashboardNavItem[];
  signedIn: boolean;
  myProfileHref: string | null;
  profileUnlinked: boolean;
  userEmail: string;
  header: HeaderProps;
  mvpDemoRibbon?: boolean;
};

export function DashboardShell({
  children,
  navItems,
  signedIn,
  myProfileHref,
  profileUnlinked,
  userEmail,
  header,
  mvpDemoRibbon = false,
}: Props) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="flex min-h-screen bg-slate-50">
        <AppSidebar
          navItems={navItems}
          signedIn={signedIn}
          myProfileHref={myProfileHref}
          profileUnlinked={profileUnlinked}
          userEmail={userEmail}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {mvpDemoRibbon ? (
            <div className="border-b border-amber-500/50 bg-amber-950 px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide text-amber-50">
              Preview build — relaxed access controls; not for production or sensitive data
            </div>
          ) : null}
          <AppHeader
            {...header}
            onMobileNavOpen={() => setMobileNavOpen(true)}
          />
          <main className="flex-1 py-6">
            <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-slate-200 bg-white shadow-xl"
            aria-modal="true"
            role="dialog"
            aria-label="Main navigation"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-bold text-white shadow-sm">
                  HR
                </span>
                <span className="text-sm tracking-tight">Retail HR</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <DashboardNavList links={navItems} onNavigate={() => setMobileNavOpen(false)} />
            <SidebarAccountFooter
              signedIn={signedIn}
              myProfileHref={myProfileHref}
              profileUnlinked={profileUnlinked}
              userEmail={userEmail}
              collapsed={false}
            />
          </aside>
        </div>
      ) : null}

      <CommandPalette />
    </>
  );
}
