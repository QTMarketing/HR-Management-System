"use client";

import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { updateEmployeeAdminAccess } from "@/app/actions/admin-access";
import {
  type AdminAccess,
  type ScheduleAccess,
  type TimeClockAccess,
  SCHEDULE_FLYOUT_TOTAL,
  TIME_CLOCK_FLYOUT_TOTAL,
  countFraction,
  defaultAdminAccess,
  formatAdminAccessSummary,
  normalizeAdminAccess,
  scheduleSelectedCount,
  timeClockManageEffective,
  timeClockSelectedCount,
} from "@/lib/users/admin-access";

type Props = {
  employeeId: string;
  access: AdminAccess | null;
  displayLabel: string;
  canEdit: boolean;
};

type FlyoutKind = "time_clock" | "schedule" | null;

export function AdminPermissionsPopover({ employeeId, access, displayLabel, canEdit }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminAccess>(() =>
    access == null ? defaultAdminAccess() : normalizeAdminAccess(access),
  );
  const [search, setSearch] = useState("");
  const [flyout, setFlyout] = useState<FlyoutKind>(null);
  const [flyoutTab, setFlyoutTab] = useState<"assets" | "permissions">("permissions");
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; maxHeight: number } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scheduleMainCb = useRef<HTMLInputElement>(null);
  const tcMainCb = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  /** Fresh draft whenever the menu opens or server data changes while open. */
  useEffect(() => {
    if (!open) return;
    setDraft(access == null ? defaultAdminAccess() : normalizeAdminAccess(access));
    setFlyout(null);
    setSearch("");
    setError(null);
  }, [open, access, employeeId]);

  const updatePanelPosition = useCallback(() => {
    const trig = triggerRef.current;
    if (!trig) return;
    const rect = trig.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const gap = 4;
    const top = rect.bottom + gap;
    const maxHeight = Math.max(180, vh - rect.bottom - gap - 12);
    let left = Math.max(8, rect.right - 320);
    left = Math.min(left, vw - 340);
    setPanelPos({ top, left, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open || !canEdit) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
  }, [open, canEdit, updatePanelPosition, flyout]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePanelPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const scheduleCount = scheduleSelectedCount(draft.schedule);
  const tcCount = timeClockSelectedCount(draft.time_clock);

  useLayoutEffect(() => {
    const el = scheduleMainCb.current;
    if (el) {
      el.indeterminate = scheduleCount > 0 && scheduleCount < SCHEDULE_FLYOUT_TOTAL;
    }
  }, [scheduleCount]);

  useLayoutEffect(() => {
    const el = tcMainCb.current;
    if (el) {
      el.indeterminate = tcCount > 0 && tcCount < TIME_CLOCK_FLYOUT_TOTAL;
    }
  }, [tcCount]);

  const q = search.trim().toLowerCase();
  const show = (label: string) => !q || label.toLowerCase().includes(q);

  const setAllSchedule = (on: boolean) => {
    setDraft((d) => ({
      ...d,
      schedule: {
        view: on,
        edit_shifts: on,
        publish_shifts: on,
        edit_settings: on,
      },
    }));
  };

  const setAllTimeClock = (on: boolean) => {
    setDraft((d) => ({
      ...d,
      time_clock: {
        view: on,
        approve_requests: on,
        edit_timesheets: on,
        edit_settings: on,
        add_delete_clocks: on,
      },
    }));
  };

  const selectAllOperations = () => setDraft(defaultAdminAccess());

  const patchSchedule = (patch: Partial<ScheduleAccess>) => {
    setDraft((d) => {
      let schedule = { ...d.schedule, ...patch };
      if (!schedule.edit_shifts) schedule = { ...schedule, publish_shifts: false };
      if (schedule.publish_shifts) {
        schedule = { ...schedule, view: true, edit_shifts: true };
      } else if (schedule.edit_shifts || schedule.edit_settings) {
        schedule = { ...schedule, view: true };
      }
      if (!schedule.view) {
        schedule = {
          view: false,
          edit_shifts: false,
          publish_shifts: false,
          edit_settings: false,
        };
      }
      return { ...d, schedule };
    });
  };

  const patchTimeClock = (patch: Partial<TimeClockAccess>) => {
    setDraft((d) => {
      let tc = { ...d.time_clock, ...patch };
      if (timeClockManageEffective(tc)) tc = { ...tc, view: true };
      if (!tc.view) {
        tc = {
          view: false,
          approve_requests: false,
          edit_timesheets: false,
          edit_settings: false,
          add_delete_clocks: false,
        };
      }
      return { ...d, time_clock: tc };
    });
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateEmployeeAdminAccess(employeeId, draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const btnClass =
    "inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70";

  const rowBar =
    "flex w-full items-center gap-2 rounded px-1.5 py-2 text-sm text-slate-800 hover:bg-slate-50";

  const flyoutPanel =
    flyout && panelPos ? (
      <div
        className="flex w-[min(17rem,calc(100vw-2rem))] shrink-0 flex-col rounded-md border border-slate-200 bg-white shadow-lg"
        style={{ maxHeight: panelPos.maxHeight }}
      >
        <div className="flex shrink-0 border-b border-slate-100">
          <button
            type="button"
            className={`flex-1 px-3 py-2 text-xs font-semibold ${
              flyoutTab === "assets"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setFlyoutTab("assets")}
          >
            Assets
          </button>
          <button
            type="button"
            className={`flex-1 px-3 py-2 text-xs font-semibold ${
              flyoutTab === "permissions"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setFlyoutTab("permissions")}
          >
            Permissions
          </button>
        </div>

        {flyoutTab === "assets" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs leading-relaxed text-slate-600">
            Assign which stores, time clocks, or schedules this admin can manage. Location and asset
            scoping will connect here in a later release.
          </div>
        ) : flyout === "time_clock" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {(
              [
                ["view", "View", draft.time_clock.view],
                ["approve_requests", "Approve requests", draft.time_clock.approve_requests],
                ["edit_timesheets", "Edit Timesheets", draft.time_clock.edit_timesheets],
                ["edit_settings", "Edit Settings", draft.time_clock.edit_settings],
                ["add_delete_clocks", "Add & Delete Time Clocks", draft.time_clock.add_delete_clocks],
              ] as const
            ).map(([key, label, checked]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-slate-800 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                  checked={checked}
                  onChange={(e) => {
                    const on = e.target.checked;
                    patchTimeClock({ [key]: on } as Partial<TimeClockAccess>);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {(
              [
                ["view", "View", draft.schedule.view],
                ["edit_shifts", "Add & edit shifts", draft.schedule.edit_shifts],
                ["publish_shifts", "Publish shifts", draft.schedule.publish_shifts],
                ["edit_settings", "Edit settings", draft.schedule.edit_settings],
              ] as const
            ).map(([key, label, checked]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-slate-800 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                  checked={checked}
                  onChange={(e) => {
                    const on = e.target.checked;
                    patchSchedule({ [key]: on } as Partial<ScheduleAccess>);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        )}
      </div>
    ) : null;

  const portalContent =
    open && canEdit && panelPos && mounted ? (
      <>
        {/*
          Full-viewport layer under the panel: avoids table overflow/stopPropagation issues
          and does not compete with Cancel/Save (those sit above at z-200).
        */}
        <div
          className="fixed inset-0 z-[199] bg-transparent"
          aria-hidden
          onPointerDown={() => setOpen(false)}
        />
        <div
          ref={wrapRef}
          className="fixed z-[200] flex items-start gap-2"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            maxHeight: panelPos.maxHeight,
          }}
        >
        <div className="flex min-w-0 w-[min(20rem,calc(100vw-2rem))] max-h-[inherit] flex-col rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="shrink-0 border-b border-slate-100 p-3">
            <p className="text-sm font-bold text-slate-900">Permissions</p>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {show("smart groups") ? (
              <label className={`${rowBar} mb-1 cursor-pointer`}>
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                  checked={draft.smart_groups}
                  onChange={(e) => setDraft((d) => ({ ...d, smart_groups: e.target.checked }))}
                />
                <span className="flex-1">Smart groups</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {draft.smart_groups ? "1/1" : "0/1"}
                </span>
              </label>
            ) : null}

            {show("operations") ||
            show("activity") ||
            show("job") ||
            show("scheduling") ||
            show("time") ||
            show("labor") ? (
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between px-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Operations
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-600 hover:underline"
                    onClick={selectAllOperations}
                  >
                    Select all
                  </button>
                </div>

                {show("activity") ? (
                  <label className={`${rowBar} cursor-pointer`}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                      checked={draft.activity}
                      onChange={(e) => setDraft((d) => ({ ...d, activity: e.target.checked }))}
                    />
                    <span className="flex-1">Activity</span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {draft.activity ? "1/1" : "0/1"}
                    </span>
                    <span className="w-4 shrink-0" aria-hidden />
                  </label>
                ) : null}

                {show("job") || show("scheduling") ? (
                  <div className={rowBar}>
                    <input
                      ref={scheduleMainCb}
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                      checked={scheduleCount === SCHEDULE_FLYOUT_TOTAL}
                      onChange={(e) => setAllSchedule(e.target.checked)}
                    />
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-1 text-left text-sm text-slate-800"
                      onClick={() => {
                        setFlyout((f) => (f === "schedule" ? null : "schedule"));
                        setFlyoutTab("permissions");
                      }}
                    >
                      <span className="flex-1">Job scheduling</span>
                      <span className="text-xs tabular-nums text-slate-500">
                        {countFraction(scheduleCount, SCHEDULE_FLYOUT_TOTAL)}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  </div>
                ) : null}

                {show("time") ? (
                  <div className={rowBar}>
                    <input
                      ref={tcMainCb}
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                      checked={tcCount === TIME_CLOCK_FLYOUT_TOTAL}
                      onChange={(e) => setAllTimeClock(e.target.checked)}
                    />
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-1 text-left text-sm text-slate-800"
                      onClick={() => {
                        setFlyout((f) => (f === "time_clock" ? null : "time_clock"));
                        setFlyoutTab("permissions");
                      }}
                    >
                      <span className="flex-1">Time Clock</span>
                      <span className="text-xs tabular-nums text-slate-500">
                        {countFraction(tcCount, TIME_CLOCK_FLYOUT_TOTAL)}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  </div>
                ) : null}

                {show("labor") ? (
                  <label className={`${rowBar} cursor-pointer`}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                      checked={draft.labor_report}
                      onChange={(e) => setDraft((d) => ({ ...d, labor_report: e.target.checked }))}
                    />
                    <span className="flex-1">Labor report</span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {draft.labor_report ? "1/1" : "0/1"}
                    </span>
                    <span className="w-4 shrink-0" aria-hidden />
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <p className="shrink-0 px-3 text-xs text-red-700">{error}</p> : null}

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 p-3">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                setFlyout(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              className="rounded-md bg-gradient-to-br from-orange-400 to-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
              onClick={save}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>

          <p className="shrink-0 px-3 pb-2 text-[10px] text-slate-400">
            Preview: {formatAdminAccessSummary(draft)}
          </p>
        </div>

        {flyout ? flyoutPanel : null}
        </div>
      </>
    ) : null;

  return (
    <>
      {canEdit ? (
        <button
          ref={triggerRef}
          type="button"
          className={btnClass}
          title="Configure module access"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="max-w-[12rem] truncate">{displayLabel || "—"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>
      ) : (
        <span className="max-w-[12rem] truncate text-xs text-slate-600" title={displayLabel}>
          {displayLabel || "—"}
        </span>
      )}

      {mounted && portalContent ? createPortal(portalContent, document.body) : null}
    </>
  );
}
