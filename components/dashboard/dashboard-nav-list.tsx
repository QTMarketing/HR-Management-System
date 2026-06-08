"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart2,
  Building2,
  CalendarRange,
  Clock,
  LayoutDashboard,
  Network,
  Shield,
  Umbrella,
  Users,
} from "lucide-react";

const ICONS: Record<string, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  "/": LayoutDashboard,
  "/users": Users,
  "/locations": Building2,
  "/security-audit": Shield,
  "/pto-admin": Umbrella,
  "/users/groups": Network,
  "/activity": Activity,
  "/time-clock": Clock,
  "/schedule": CalendarRange,
  "/reports/employee-records": BarChart2,
  "/reports/labor": BarChart2,
};

export type DashboardNavItem = {
  href: string;
  label: string;
  group?: "main" | "operations";
};

function activePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/users") return pathname === "/users";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  links: DashboardNavItem[];
  /** Close mobile drawer after navigation */
  onNavigate?: () => void;
  /** Collapsed icon-only rail (desktop sidebar) */
  collapsed?: boolean;
};

export function DashboardNavList({ links, onNavigate, collapsed = false }: Props) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {links.map((item, i) => {
        const { href, label, group } = item;
        const prevGroup = i > 0 ? links[i - 1]?.group : undefined;
        const showOperationsHeading =
          !collapsed && group === "operations" && prevGroup !== "operations";
        const active = activePath(pathname, href);
        const Icon = ICONS[href] ?? LayoutDashboard;
        return (
          <div key={href}>
            {showOperationsHeading ? (
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Operations
              </p>
            ) : null}
            <Link
              href={href}
              onClick={() => onNavigate?.()}
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
  );
}
