import type {
  AttendanceHubLeaveRow,
  AttendanceHubPresentRow,
  AttendanceHubScheduledRow,
} from "@/lib/dashboard/attendance-hub-types";

/**
 * Synthetic 'Attendance hub' rows used when the dashboard is rendering on
 * demo KPIs (no live database). All ids are prefixed with `demo-` so the
 * Sheet renders them as plain rows (no dead /users/[id] links).
 */
export function demoAttendanceHub(scopeLabel: string): {
  scheduled: AttendanceHubScheduledRow[];
  present: AttendanceHubPresentRow[];
  onLeave: AttendanceHubLeaveRow[];
} {
  const store = scopeLabel.split("—")[0]?.trim() || scopeLabel || "Store";
  const today = new Date();
  const at = (h: number, m = 0): string => {
    const d = new Date(today);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const scheduled: AttendanceHubScheduledRow[] = [
    {
      id: "demo-sch-1",
      fullName: "Jamie L.",
      storeName: store,
      shiftStartIso: at(9, 0),
      shiftEndIso: at(17, 0),
      clockInAtIso: at(8, 55),
    },
    {
      id: "demo-sch-2",
      fullName: "Alex P.",
      storeName: store,
      shiftStartIso: at(9, 0),
      shiftEndIso: at(17, 0),
      clockInAtIso: at(8, 58),
    },
    {
      id: "demo-sch-3",
      fullName: "Riley K.",
      storeName: store,
      shiftStartIso: at(9, 0),
      shiftEndIso: at(17, 0),
      clockInAtIso: null,
    },
    {
      id: "demo-sch-4",
      fullName: "Casey R.",
      storeName: store,
      shiftStartIso: at(10, 0),
      shiftEndIso: at(18, 0),
      clockInAtIso: null,
    },
  ];

  const present: AttendanceHubPresentRow[] = [
    {
      id: "demo-pres-1",
      fullName: "Jamie L.",
      storeName: store,
      clockInAtIso: at(8, 55),
    },
    {
      id: "demo-pres-2",
      fullName: "Alex P.",
      storeName: store,
      clockInAtIso: at(8, 58),
    },
  ];

  const onLeave: AttendanceHubLeaveRow[] = [
    {
      id: "demo-leave-1",
      fullName: "Morgan T.",
      storeName: store,
      leaveType: "Vacation",
      allDay: true,
      startAtIso: at(0, 0),
      endAtIso: at(23, 59),
    },
  ];

  return { scheduled, present, onLeave };
}
