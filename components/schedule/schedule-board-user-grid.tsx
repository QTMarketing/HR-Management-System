"use client";

import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { deleteShift, deleteUnavailability } from "@/app/actions/schedule";
import { Trash2 } from "lucide-react";
import type { DayColumn, ShiftForBoard } from "@/lib/schedule/board-model";
import { shiftsForUserCell } from "@/lib/schedule/board-model";
import { ScheduleCellHoverActions } from "@/components/schedule/schedule-cell-hover-actions";
import {
  formatSpan,
  sameCalendarDay,
  toHmLocal,
  toYmdLocal,
} from "@/components/schedule/schedule-board-format";
import type { ScheduleEmployeeOption } from "@/components/schedule/add-shift-modal";
import type { ScheduleLocationOption } from "@/components/schedule/add-shift-modal";

type LocPicker = ScheduleLocationOption;

export type ScheduleBoardUserGridRowsProps = {
  section: string;
  employeesForPicker: ScheduleEmployeeOption[];
  shifts: ShiftForBoard[];
  weekMonday: Date;
  displayedColumns: DayColumn[];
  columns: DayColumn[];
  viewRange: "day" | "week" | "month";
  today: Date;
  canEditSchedule: boolean;
  cellMenuKey: string | null;
  setCellMenuKey: (k: string | null) => void;
  openCreateShift: (seed: {
    locationId?: string;
    employeeIds?: string[];
    jobId?: string;
    start?: Date;
    end?: Date;
  }) => void;
  openSchedulePanelForEmployee: (emp: ScheduleEmployeeOption) => void;
  goTimeClockForTimeOff: () => void;
  openUnavailability: (seed: {
    employeeId: string;
    employeeName: string;
    locationId: string;
    locationName: string;
    start: Date;
    end: Date;
  }) => void;
  deletePending: boolean;
  startDeleteTransition: (fn: () => void) => void;
  routerRefresh: () => void;
  afterMutation: () => void;
  setDeleteError: (e: string | null) => void;
  setEditingShiftId: (id: string | null) => void;
  setPublishError: (e: string | null) => void;
  setModalNonce: Dispatch<SetStateAction<number>>;
  setAddOpen: (v: boolean) => void;
  scopeAll: boolean;
  locationNamesById: Map<string, string>;
  locationLabel: string;
  defaultLocationId: string | null;
  locationsForPicker: LocPicker[];
  unavailByEmployeeDay: Map<
    string,
    { id: string; reason: string | null; start_at: string; end_at: string }[]
  >;
};

export function ScheduleBoardUserGridRows({
  section,
  employeesForPicker,
  shifts,
  weekMonday,
  displayedColumns,
  columns,
  viewRange,
  today,
  canEditSchedule,
  cellMenuKey,
  setCellMenuKey,
  openCreateShift,
  openSchedulePanelForEmployee,
  goTimeClockForTimeOff,
  openUnavailability,
  deletePending,
  startDeleteTransition,
  routerRefresh,
  afterMutation,
  setDeleteError,
  setEditingShiftId,
  setPublishError,
  setModalNonce,
  setAddOpen,
  scopeAll,
  locationNamesById,
  locationLabel,
  defaultLocationId,
  locationsForPicker,
  unavailByEmployeeDay,
}: ScheduleBoardUserGridRowsProps) {
  return (
    <>
      {employeesForPicker.map((emp) => (
        <div
          key={`${section}-${emp.id}`}
          className="grid border-b border-slate-100 bg-white"
          style={{
            gridTemplateColumns: `200px repeat(7, minmax(110px, 1fr))`,
            boxShadow: `inset 4px 0 0 0 #e2e8f0`,
          }}
        >
          <div className="border-r border-slate-200 px-2 py-2">
            {canEditSchedule ? (
              <button
                type="button"
                className="w-full rounded-md px-1 py-0.5 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                onClick={() => openSchedulePanelForEmployee(emp)}
                title="Add or edit shifts for this team member"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  {emp.full_name}
                </span>
              </button>
            ) : (
              <Link
                href={`/users/${emp.id}`}
                className="block w-full rounded-md px-1 py-0.5 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                title="Open employee profile"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  {emp.full_name}
                </span>
              </Link>
            )}
          </div>
          {displayedColumns.map((_, di) => {
            const dayIndex =
              viewRange === "day"
                ? Math.max(
                    0,
                    Math.min(
                      6,
                      Math.floor(
                        (displayedColumns[0]!.date.getTime() - weekMonday.getTime()) / 86400000,
                      ),
                    ),
                  )
                : di;
            const cell = shiftsForUserCell(shifts, section, emp.id, weekMonday, dayIndex);
            const isToday = sameCalendarDay(columns[di].date, today);
            const dateForCell = displayedColumns[di]?.date ?? columns[di]!.date;
            const start = new Date(dateForCell);
            start.setHours(9, 0, 0, 0);
            const end = new Date(dateForCell);
            end.setHours(17, 0, 0, 0);
            const unKey = `${emp.id}:${toYmdLocal(dateForCell)}`;
            const unBlocks = unavailByEmployeeDay.get(unKey) ?? [];
            const locSeed =
              employeesForPicker.find((e) => e.id === emp.id)?.location_id ||
              ((!scopeAll && defaultLocationId) || locationsForPicker[0]?.id || undefined);
            const locName = locationNamesById.get(locSeed ?? "") ?? locationLabel;
            return (
              <div
                key={di}
                className={`group relative min-h-[80px] border-r border-slate-100 p-1 last:border-r-0 ${
                  isToday ? "bg-sky-50/50" : ""
                }`}
              >
                {unBlocks.length ? (
                  <div
                    className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-amber-200/70"
                    title={unBlocks
                      .map((b) => {
                        const s = new Date(b.start_at);
                        const e = new Date(b.end_at);
                        const span =
                          Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())
                            ? "Unavailable"
                            : `${toHmLocal(s)}–${toHmLocal(e)}`;
                        return `${span}${b.reason ? ` — ${b.reason}` : ""}`;
                      })
                      .join("\n")}
                  >
                    <div
                      className="absolute inset-0 rounded-md bg-amber-50/70"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(135deg, rgba(245,158,11,0.22) 0px, rgba(245,158,11,0.22) 8px, rgba(255,251,235,0.65) 8px, rgba(255,251,235,0.65) 16px)",
                      }}
                    />
                    <div className="absolute left-1 top-1 rounded-full bg-amber-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                      Unavailable{unBlocks.length > 1 ? ` ×${unBlocks.length}` : ""}
                    </div>
                    {(() => {
                      const first = unBlocks[0];
                      if (!first) return null;
                      const s = new Date(first.start_at);
                      const e = new Date(first.end_at);
                      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
                      return (
                        <div className="absolute left-1 top-6 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200/70">
                          {toHmLocal(s)}–{toHmLocal(e)}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
                {canEditSchedule && cell.length === 0 ? (
                  <ScheduleCellHoverActions
                    menuKey={`user-${section}-${emp.id}-${di}`}
                    openMenuKey={cellMenuKey}
                    setOpenMenuKey={setCellMenuKey}
                    onQuickAdd={() =>
                      openCreateShift({
                        locationId: locSeed,
                        employeeIds: [emp.id],
                        start,
                        end,
                      })
                    }
                    onTimeOff={goTimeClockForTimeOff}
                    onUnavailability={() =>
                      unBlocks.length
                        ? startDeleteTransition(async () => {
                            const r = await deleteUnavailability({
                              unavailabilityId: unBlocks[0]!.id,
                            });
                            if (!r.ok) {
                              window.alert(r.error);
                              return;
                            }
                            routerRefresh();
                          })
                        : openUnavailability({
                            employeeId: emp.id,
                            employeeName: emp.full_name,
                            locationId: locSeed ?? emp.location_id,
                            locationName: locName,
                            start,
                            end,
                          })
                    }
                    unavailabilityLabel={
                      unBlocks.length
                        ? `Remove unavailability${unBlocks.length > 1 ? " (earliest)" : ""}`
                        : "Add unavailability"
                    }
                  />
                ) : null}
                <div className="relative z-[1] flex flex-col gap-1">
                  {cell.map((s) => (
                    <div
                      key={s.id}
                      className="group relative w-full rounded-md border border-slate-200/90 bg-white text-left shadow-sm transition hover:shadow-md"
                      style={{ borderTop: `3px solid ${s.jobColorHex}` }}
                    >
                      {canEditSchedule ? (
                        <button
                          type="button"
                          className="absolute right-0.5 top-0.5 z-[1] rounded p-0.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-red-600 group-hover:opacity-100"
                          title="Delete shift"
                          disabled={deletePending}
                          aria-label="Delete shift"
                          onClick={() => {
                            if (!confirm("Delete this shift? This cannot be undone.")) {
                              return;
                            }
                            setDeleteError(null);
                            startDeleteTransition(async () => {
                              const r = await deleteShift({ shiftId: s.id });
                              if (!r.ok) {
                                setDeleteError(r.error);
                                return;
                              }
                              afterMutation();
                            });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <div className="px-2 pb-1.5 pt-2 pr-7">
                        <button
                          type="button"
                          className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-400"
                          disabled={!canEditSchedule}
                          title={
                            canEditSchedule
                              ? "Edit shift"
                              : "You don’t have permission to edit shifts."
                          }
                          onClick={() => {
                            if (!canEditSchedule) return;
                            setDeleteError(null);
                            setPublishError(null);
                            setEditingShiftId(s.id);
                            setModalNonce((n) => n + 1);
                            setAddOpen(true);
                          }}
                        >
                          <div className="text-[11px] font-semibold text-slate-900">
                            {formatSpan(s.shift_start, s.shift_end)}
                          </div>
                          <div className="truncate text-[11px] text-slate-700">{s.jobName ?? "No job"}</div>
                        </button>
                        {!s.isPublished ? (
                          <div className="mt-0.5 text-[9px] font-medium text-amber-700">Draft</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
