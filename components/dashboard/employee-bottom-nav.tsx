"use client";

import { CalendarDays, Clock, Home, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/schedule/board")) {
    return pathname === "/schedule/board" || pathname.startsWith("/schedule/board?");
  }
  if (href.startsWith("/users/")) return pathname.startsWith("/users/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function iconFor(label: string) {
  switch (label) {
    case "Home":
      return Home;
    case "My punches":
      return Clock;
    case "Schedule":
      return CalendarDays;
    case "Profile":
      return User;
    default:
      return Home;
  }
}

type Props = {
  links: NavLink[];
};

export function EmployeeBottomNav({ links }: Props) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Employee navigation"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          const Icon = iconFor(link.label);
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-2.5 text-[10px] font-semibold transition-colors ${
                  active ? "text-orange-700" : "text-slate-500 hover:text-slate-800"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={`h-5 w-5 ${active ? "text-orange-600" : ""}`} aria-hidden />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
