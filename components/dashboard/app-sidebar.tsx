"use client";

import Link from "next/link";
import { useState } from "react";
import { SidebarAccountFooter } from "@/components/dashboard/sidebar-account-footer";
import { DashboardNavList, type DashboardNavItem } from "@/components/dashboard/dashboard-nav-list";
import { Menu, PanelLeftClose } from "lucide-react";

type SidebarProps = {
  /** When set (from server RBAC), only these links are shown. */
  navItems?: DashboardNavItem[];
  signedIn?: boolean;
  myProfileHref?: string | null;
  profileUnlinked?: boolean;
  userEmail?: string;
};

export function AppSidebar({
  navItems,
  signedIn = false,
  myProfileHref = null,
  profileUnlinked = false,
  userEmail = "",
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const links: DashboardNavItem[] =
    navItems && navItems.length > 0
      ? navItems
      : [
          { href: "/", label: "Dashboard", group: "main" },
          { href: "/users", label: "Users", group: "main" },
          { href: "/users/groups", label: "Smart groups", group: "main" },
          { href: "/activity", label: "Activity", group: "operations" },
          { href: "/time-clock", label: "Time Clock", group: "operations" },
          { href: "/schedule", label: "Schedule", group: "operations" },
          { href: "/reports/labor", label: "Labor report", group: "operations" },
        ];

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm transition-[width] duration-300 ease-in-out md:flex ${
        collapsed ? "w-[4.5rem]" : "w-64"
      }`}
    >
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
        <Link
          href="/"
          className={`flex items-center gap-2 font-semibold text-slate-800 ${collapsed ? "justify-center" : ""}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-bold text-white shadow-sm">
            HR
          </span>
          {!collapsed && (
            <span className="truncate text-sm tracking-tight">Retail HR</span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <Menu className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      <DashboardNavList links={links} collapsed={collapsed} />

      <SidebarAccountFooter
        signedIn={signedIn}
        myProfileHref={myProfileHref}
        profileUnlinked={profileUnlinked}
        userEmail={userEmail}
        collapsed={collapsed}
      />
    </aside>
  );
}
