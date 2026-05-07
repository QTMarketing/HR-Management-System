"use client";

import { deleteShift } from "@/app/actions/schedule";
import { Trash2 } from "lucide-react";
import type { DayColumn, JobRowDef, ShiftForBoard } from "@/lib/schedule/board-model";
import { shiftsForCell } from "@/lib/schedule/board-model";
import { ScheduleCellHoverActions } from "@/components/schedule/schedule-cell-hover-actions";
import { formatSpan, sameCalendarDay } from "@/components/schedule/schedule-board-format";

type LocPicker = { id: string; name: string };

export type ScheduleBoardJobGridRowsProps = {
  section: string;
  jobs: JobRowDef[];
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
  goTimeClockForTimeOff: () => void;
  openUnavailabilityComingSoon: () => void;
  deletePending: boolean;
  startDeleteTransition: (fn: () => void) => void;
  afterMutation: () => void;
  setDeleteError: (e: string | null) => void;
  setEditingShiftId: (id: string | null) => void;
  setPublishError: (e: string | null) => void;
  setModalNonce: React.Dispatch<React.SetStateAction<number>>;
  setAddOpen: (v: boolean) => void;
  scopeAll: boolean;
  locationNamesById: Map<string, string>;
  defaultLocationId: string | null;
  locationsForPicker: LocPicker[];
};

export function ScheduleBoardJobGridRows({
  section,
  jobs,
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
  goTimeClockForTimeOff,
  openUnavailabilityComingSoon,
  deletePending,
  startDeleteTransition,
  afterMutation,
  setDeleteError,
  setEditingShiftId,
  setPublishError,
  setModalNonce,
  setAddOpen,
  scopeAll,
  locationNamesById,
  defaultLocationId,
  locationsForPicker,
}: ScheduleBoardJobGridRowsProps) {
  return (
    <>
      {jobs.map((jobRow) => (
        <div
          key={`${section}-${jobRow.rowKey}`}
          className="grid border-b border-slate-100 bg-white"
          style={{
            gridTemplateColumns: `200px repeat(7, minmax(110px, 1fr))`,
            boxShadow: `inset 4px 0 0 0 ${jobRow.colorHex}`,
          }}
        >
          <div className="border-r border-slate-200 px-2 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              {jobRow.label}
            </span>
            <div className="mt-0.5 text-[10px] text-slate-500">Row color matches shift cards</div>
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
            const cell = shiftsForCell(shifts, section, jobRow.rowKey, weekMonday, dayIndex);
            const isToday = sameCalendarDay(columns[di].date, today);
            const dateForCell = displayedColumns[di]?.date ?? columns[di]!.date;
            const start = new Date(dateForCell);
            start.setHours(9, 0, 0, 0);
            const end = new Date(dateForCell);
            end.setHours(17, 0, 0, 0);
            const locSeed =
              (!scopeAll && defaultLocationId) || locationsForPicker[0]?.id || undefined;
            return (
              <div
                key={di}
                className={`group relative min-h-[80px] border-r border-slate-100 p-1 last:border-r-0 ${
                  isToday ? "bg-sky-50/50" : ""
                }`}
              >
                {canEditSchedule && cell.length === 0 ? (
                  <ScheduleCellHoverActions
                    menuKey={`job-${section}-${jobRow.rowKey}-${di}`}
                    openMenuKey={cellMenuKey}
                    setOpenMenuKey={setCellMenuKey}
                    onQuickAdd={() =>
                      openCreateShift({
                        locationId: locSeed,
                        employeeIds: [],
                        jobId: jobRow.rowKey,
                        start,
                        end,
                      })
                    }
                    onTimeOff={goTimeClockForTimeOff}
                    onUnavailability={openUnavailabilityComingSoon}
                  />
                ) : null}
                <div className="relative z-[1] flex flex-col gap-1">
                  {cell.map((s) => (
                    <div
                      key={s.id}
                      className="group relative w-full rounded-md border border-slate-200/90 bg-white text-left shadow-sm transition hover:shadow-md"
                      style={{ borderTop: `3px solid ${s.jobColorHex}` }}
                    >
                      {s.notifyBadgeCount > 0 ? (
                        <span className="absolute -left-1 -top-1 z-[1] flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white shadow">
                          {s.notifyBadgeCount}
                        </span>
                      ) : null}
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
                          <div className="truncate text-[11px] text-slate-700">{s.assignedLabel}</div>
                        </button>
                        {scopeAll ? (
                          <div className="mt-0.5 truncate text-[9px] text-slate-400">
                            {locationNamesById.get(s.location_id) ??
                              locationsForPicker.find((l) => l.id === s.location_id)?.name ??
                              "Store"}
                          </div>
                        ) : null}
                        {!s.isPublished ? (
                          <div className="mt-0.5 text-[9px] font-medium text-amber-700">Draft</div>
                        ) : null}
                        <div className="mt-1 flex justify-end text-[10px] font-medium tabular-nums text-slate-500">
                          {s.assignCount}/{s.slotsTotal}
                        </div>
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
