"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  /** Hide Smart groups tab when RBAC denies `users.groups.view`. */
  showSmartGroups?: boolean;
};

/**
 * Connecteam-style sub-area: employee directory vs smart groups (dynamic segments).
 */
export function UsersSectionTabs({ showSmartGroups = true }: Props) {
  const pathname = usePathname();
  const onGroups = pathname.startsWith("/users/groups");
  const onDirectory = !onGroups;

  const tabClass = (active: boolean) =>
    `border-b-2 pb-3 text-sm font-semibold transition-colors ${
      active
        ? "border-orange-500 text-orange-900"
        : "border-transparent text-slate-500 hover:text-slate-800"
    }`;

  return (
    <nav className="flex gap-8 border-b border-slate-200" aria-label="Users area">
      <Link href="/users" className={tabClass(onDirectory)}>
        Users
      </Link>
      {showSmartGroups ? (
        <Link href="/users/groups" className={tabClass(onGroups)}>
          Smart groups
        </Link>
      ) : null}
    </nav>
  );
}
