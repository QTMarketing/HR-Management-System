"use client";

import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import type { ActivityFeedItem } from "@/components/dashboard/activity-feed.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

function mapActivityStatus(s: string): ActivityFeedItem["status"] {
  if (s === "ok" || s === "late" || s === "info") return s;
  return "info";
}

const ALL = "__all__";
const EXPLORE_PAGE_SIZE = 15;

type Props = {
  initialItems: ActivityFeedItem[];
  locationId: string;
  enableRealtime: boolean;
  errorMessage?: string | null;
  emptyHint?: string | null;
  /** Search / action & status filters + link to Users (Activity page). */
  exploreMode?: boolean;
  /** Cap list length (realtime + initial). Default 12 for dashboard; raise on Activity. */
  maxFeedItems?: number;
  /** Override ActivityFeed outer container (e.g. taller max-height). */
  feedClassName?: string;
};

export function ActivityFeedLive({
  initialItems,
  locationId,
  enableRealtime,
  errorMessage,
  emptyHint,
  exploreMode = false,
  maxFeedItems = 12,
  feedClassName,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (!enableRealtime || !locationId) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`activity:${locationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_events",
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const id = String(row.id ?? "");
          const item: ActivityFeedItem = {
            id,
            who: String(row.employee_label ?? ""),
            action: String(row.action ?? ""),
            status: mapActivityStatus(String(row.status ?? "")),
            occurredAt: String(row.occurred_at ?? ""),
          };
          setItems((prev) => {
            if (prev.some((p) => p.id === item.id)) return prev;
            const merged = [item, ...prev];
            merged.sort(
              (a, b) =>
                new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
            );
            return merged.slice(0, maxFeedItems);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enableRealtime, locationId, maxFeedItems]);

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      if (i.action.trim()) set.add(i.action);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    if (!exploreMode) return items;
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const matchQ =
        !q ||
        i.who.toLowerCase().includes(q) ||
        i.action.toLowerCase().includes(q);
      const matchAction = actionFilter === ALL || i.action === actionFilter;
      const matchStatus = statusFilter === ALL || i.status === statusFilter;
      return matchQ && matchAction && matchStatus;
    });
  }, [items, exploreMode, search, actionFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / EXPLORE_PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const pagedItems = useMemo(() => {
    if (!exploreMode) return items;
    const start = (pageSafe - 1) * EXPLORE_PAGE_SIZE;
    return filtered.slice(start, start + EXPLORE_PAGE_SIZE);
  }, [exploreMode, items, filtered, pageSafe]);

  useEffect(() => {
    setPage(1);
  }, [search, actionFilter, statusFilter]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const usersHref = useMemo(() => {
    const q = search.trim();
    return q ? `/users?q=${encodeURIComponent(q)}` : "/users";
  }, [search]);

  const feedEmptyHint =
    exploreMode && filtered.length === 0 && items.length > 0
      ? "No events match your search or filters. Try clearing filters or use Search employees to open the directory."
      : emptyHint;

  const rangeStart =
    filtered.length === 0 ? 0 : (pageSafe - 1) * EXPLORE_PAGE_SIZE + 1;
  const rangeEnd = Math.min(pageSafe * EXPLORE_PAGE_SIZE, filtered.length);

  const paginationFooter =
    exploreMode && !errorMessage && filtered.length > 0 ? (
      <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-600">
          <span className="tabular-nums">
            {rangeStart}–{rangeEnd} of {filtered.length}
          </span>{" "}
          <span className="text-slate-500">events</span>
        </p>
        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Previous
            </button>
            <span className="tabular-nums text-xs text-slate-600">
              Page {pageSafe} of {totalPages}
            </span>
            <button
              type="button"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  const toolbar = exploreMode ? (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
      <div className="relative min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or action…"
          autoComplete="off"
          aria-label="Search activity by name or action"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
      </div>
      <select
        value={actionFilter}
        onChange={(e) => setActionFilter(e.target.value)}
        aria-label="Filter by action type"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 sm:w-auto sm:min-w-[10.5rem]"
      >
        <option value={ALL}>All actions</option>
        {actionOptions.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        aria-label="Filter by status"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 sm:w-auto sm:min-w-[9.5rem]"
      >
        <option value={ALL}>All statuses</option>
        <option value="ok">On time</option>
        <option value="late">Late</option>
        <option value="info">Info</option>
      </select>
      <Link
        href={usersHref}
        className={`inline-flex w-full shrink-0 items-center justify-center gap-2 px-4 py-2 text-sm sm:w-auto ${PRIMARY_ORANGE_CTA}`}
      >
        <Users className="h-4 w-4 shrink-0" aria-hidden />
        Search employees
      </Link>
    </div>
  ) : null;

  return (
    <ActivityFeed
      items={exploreMode ? pagedItems : items}
      errorMessage={errorMessage}
      emptyHint={feedEmptyHint}
      toolbar={toolbar}
      footer={paginationFooter}
      className={feedClassName}
    />
  );
}
