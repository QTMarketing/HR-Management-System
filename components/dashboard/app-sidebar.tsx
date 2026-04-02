"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SidebarAccountFooter } from "@/components/dashboard/sidebar-account-footer";
import {
  Activity,
  BarChart2,
  Building2,
  CalendarRange,
  Clock,
  LayoutDashboard,
  Menu,
  Network,
  PanelLeftClose,
  Shield,
  Users,
} from "lucide-react";

const ICONS = {
  "/": LayoutDashboard,
  "/users": Users,
  "/locations": Building2,
  "/security-audit": Shield,
  "/users/groups": Network,
  "/activity": Activity,
  "/time-clock": Clock,
  "/schedule": CalendarRange,
  "/reports/labor": BarChart2,
} as const;

type NavLink = { href: string; label: string; group?: "main" | "operations" };

const defaultNav: NavLink[] = [
  { href: "/", label: "Dashboard", group: "main" },
  { href: "/users", label: "Users", group: "main" },
  { href: "/users/groups", label: "Smart groups", group: "main" },
  { href: "/activity", label: "Activity", group: "operations" },
  { href: "/time-clock", label: "Time Clock", group: "operations" },
  { href: "/schedule", label: "Schedule", group: "operations" },
  { href: "/reports/labor", label: "Labor report", group: "operations" },
];

function activePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  /** Directory home only — /users/groups is its own nav item. */
  if (href === "/users") return pathname === "/users";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarProps = {
  /** When set (from server RBAC), only these links are shown. */
  navItems?: NavLink[];
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
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const links: NavLink[] =
    navItems && navItems.length > 0
      ? navItems
      : defaultNav;

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm transition-[width] duration-300 ease-in-out ${
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

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {links.map((item, i) => {
          const { href, label, group } = item;
          const prevGroup = i > 0 ? links[i - 1]?.group : undefined;
          const showOperationsHeading =
            !collapsed && group === "operations" && prevGroup !== "operations";
          const active = activePath(pathname, href);
          const Icon = ICONS[href as keyof typeof ICONS] ?? LayoutDashboard;
          return (
            <div key={href}>
              {showOperationsHeading ? (
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Operations
                </p>
              ) : null}
              <Link
                href={href}
                className={`flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-2 text-sm font-semibold transition-colors ${
                  active
                    ? "border-l-4 border-orange-500 bg-orange-50 text-orange-950"
                    : "border-l-4 border-transparent text-slate-800 hover:bg-slate-50"
                } ${collapsed ? "justify-center px-0" : ""}`}
                title={collapsed ? label : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

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
