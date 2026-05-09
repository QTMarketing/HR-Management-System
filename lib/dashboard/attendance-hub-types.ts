/**
 * Shapes shared between the `getAttendanceHub` server action and the
 * client-side AttendanceHubSheet. Each tab gets its own row type so the
 * client can render the right secondary detail without inferring it from
 * a flat string subtitle.
 */

export type AttendanceHubScheduledRow = {
  /** Employee id (drives /users/[id] navigation). */
  id: string;
  fullName: string;
  storeName: string;
  shiftStartIso: string;
  shiftEndIso: string;
  /** First clock-in today, if any. Used to flag late arrivals. */
  clockInAtIso: string | null;
};

export type AttendanceHubPresentRow = {
  id: string;
  fullName: string;
  storeName: string;
  /** Open punch start; client computes live duration with a 30s ticker. */
  clockInAtIso: string;
};

export type AttendanceHubLeaveRow = {
  id: string;
  fullName: string;
  storeName: string;
  leaveType: string;
  allDay: boolean;
  startAtIso: string;
  endAtIso: string;
};

export type AttendanceHubResult =
  | {
      ok: true;
      scheduled: AttendanceHubScheduledRow[];
      present: AttendanceHubPresentRow[];
      onLeave: AttendanceHubLeaveRow[];
    }
  | { ok: false; error: string };
