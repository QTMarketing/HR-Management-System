"use client";

import {
  CalendarRange,
  Clock,
  LayoutDashboard,
  Palmtree,
  Search,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emitRequestTimeOff,
  REQUEST_TIME_OFF_EVENT,
} from "@/lib/ui/request-time-off-signal";

type Command = {
  id: string;
  label: string;
  hint: string;
  /** Comma-separated keywords used by the fuzzy-ish filter. */
  keywords: string;
  icon: LucideIcon;
  run: () => void;
};

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "go-dashboard",
        label: "Go to Dashboard",
        hint: "Home overview",
        keywords: "home dashboard overview",
        icon: LayoutDashboard,
        run: () => {
          router.push("/");
          close();
        },
      },
      {
        id: "go-schedule",
        label: "Open Schedule",
        hint: "Shifts & weekly board",
        keywords: "schedule shifts week board",
        icon: CalendarRange,
        run: () => {
          router.push("/schedule");
          close();
        },
      },
      {
        id: "go-time-clock",
        label: "Time Clock",
        hint: "Time logs & timesheets",
        keywords: "clock punch timesheet hours time log shift",
        icon: Clock,
        run: () => {
          router.push("/time-clock");
          close();
        },
      },
      {
        id: "request-time-off",
        label: "Request Time Off",
        hint: "Submit a vacation or sick request",
        keywords: "pto vacation sick leave time off request",
        icon: Palmtree,
        run: () => {
          if (pathname === "/") {
            emitRequestTimeOff({ alreadyOnHub: true });
          } else {
            emitRequestTimeOff({ alreadyOnHub: false });
            router.push("/");
          }
          close();
        },
      },
    ],
    [router, pathname, close],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint} ${c.keywords}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Keep `activeIdx` valid as the filtered list shrinks.
  useEffect(() => {
    if (activeIdx >= filtered.length) {
      setActiveIdx(filtered.length === 0 ? 0 : filtered.length - 1);
    }
  }, [activeIdx, filtered.length]);

  // Global Cmd+K / Ctrl+K toggle.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isModifier = e.metaKey || e.ctrlKey;
      if (isModifier && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // Close on route change so the palette never lingers after navigation.
  useEffect(() => {
    close();
    // intentionally only on pathname; close is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Auto-focus the input whenever the palette opens.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  function onArrow(delta: 1 | -1) {
    if (filtered.length === 0) return;
    setActiveIdx((i) => {
      const next = (i + delta + filtered.length) % filtered.length;
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                onArrow(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                onArrow(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const cmd = filtered[activeIdx];
                if (cmd) cmd.run();
              }
            }}
            type="text"
            placeholder="Type a command or jump to a page…"
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            aria-label="Search commands"
          />
          <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500 sm:inline-flex">
            ESC
          </kbd>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto py-1" role="listbox" aria-label="Quick actions">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              No matches for &ldquo;{query}&rdquo;.
            </li>
          ) : (
            filtered.map((c, i) => {
              const Icon = c.icon;
              const active = i === activeIdx;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => c.run()}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                      active
                        ? "bg-orange-50 text-orange-950"
                        : "text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${
                        active
                          ? "bg-white text-orange-700 ring-orange-200/80"
                          : "bg-slate-50 text-slate-600 ring-slate-200/80"
                      }`}
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.label}</span>
                      <span className="block truncate text-xs text-slate-500">{c.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
              ↑↓
            </kbd>
            <span>navigate</span>
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
              ↵
            </kbd>
            <span>select</span>
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
              ⌘ K
            </kbd>
            <span>toggle</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// Re-exported so other modules can import everything from one place.
export { REQUEST_TIME_OFF_EVENT };
