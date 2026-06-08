"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/users/")) return pathname.startsWith("/users/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  links: NavLink[];
};

/** Desktop/tablet nav when the manager sidebar is hidden. */
export function EmployeePortalNav({ links }: Props) {
  const pathname = usePathname();

  return (
    <nav
      className="hidden border-b border-slate-200 bg-white md:block"
      aria-label="Employee navigation"
    >
      <ul className="mx-auto flex max-w-3xl gap-1 px-4 sm:px-6">
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`inline-block border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-orange-600 text-orange-800"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
