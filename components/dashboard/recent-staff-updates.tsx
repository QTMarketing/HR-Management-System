import { EllipsisTd } from "@/components/ui/ellipsis-td";

import type { StaffUpdateRow } from "./recent-staff-updates.types";

const statusStyles = {
  approved: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-800",
    label: "Approved",
  },
  review: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-900",
    label: "Review",
  },
  pending: {
    dot: "bg-violet-500",
    pill: "bg-violet-50 text-violet-900",
    label: "Pending",
  },
} as const;

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

type Props = {
  rows: StaffUpdateRow[];
  errorMessage?: string | null;
  emptyHint?: string | null;
};

export function RecentStaffUpdates({ rows, errorMessage, emptyHint }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Recent staff updates</h2>
        <p className="mt-0.5 text-xs text-slate-500">Last changes from your team</p>
      </div>

      {errorMessage ? (
        <p className="px-5 py-4 text-sm text-red-600">{errorMessage}</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">
          {emptyHint ??
            "No rows yet. Run supabase/migrations/002_attendance_and_staff_updates.sql."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="whitespace-nowrap py-3 pl-5 pr-4">Employee</th>
                <th className="whitespace-nowrap py-3 pr-4">Update</th>
                <th className="whitespace-nowrap py-3 pr-4">Status</th>
                <th className="whitespace-nowrap py-3 pr-5">Time</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {rows.map((row) => {
                const st = statusStyles[row.status];
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                    <EllipsisTd
                      padClass="py-3 pl-5 pr-4 align-middle"
                      maxClass="max-w-[14rem]"
                      title={row.employeeLabel}
                      className="font-medium text-slate-900"
                    >
                      {row.employeeLabel}
                    </EllipsisTd>
                    <EllipsisTd
                      padClass="py-3 pr-4 align-middle"
                      maxClass="max-w-[28rem]"
                      title={row.updateText}
                    >
                      {row.updateText}
                    </EllipsisTd>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-snug ${st.pill}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="py-3 pr-5 text-slate-500">
                      <time dateTime={row.createdAt}>{formatTime(row.createdAt)}</time>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
