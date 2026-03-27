/** Bar heights use px inside a fixed track so bars always render (not % of undefined parent). */
const MAX_BAR_PX = 176;

export type AttendanceTrendPoint = {
  /** 0 = Monday … 6 = Sunday — unique key (labels can repeat, e.g. "T"). */
  dayIndex: number;
  dayLabel: string;
  onTimePct: number;
};

type Props = {
  points: AttendanceTrendPoint[];
  errorMessage?: string | null;
  emptyHint?: string | null;
};

export function AttendanceTrendChart({ points, errorMessage, emptyHint }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">Attendance trends</h2>
      <p className="mt-0.5 text-xs text-slate-500">Last 7 days · on-time % (from Supabase)</p>

      {errorMessage ? (
        <p className="mt-6 text-sm text-red-600">{errorMessage}</p>
      ) : points.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          {emptyHint ??
            "No trend data. Run supabase/migrations/002_attendance_and_staff_updates.sql in the SQL Editor."}
        </p>
      ) : (
        <div className="mt-6 flex h-56 items-end justify-between gap-2">
          {points.map((p) => {
            const barPx = Math.max(6, (p.onTimePct / 100) * MAX_BAR_PX);
            return (
              <div key={p.dayIndex} className="flex min-h-0 flex-1 flex-col items-center gap-2">
                <div
                  className="flex w-full flex-1 flex-col items-center justify-end"
                  style={{ maxHeight: MAX_BAR_PX }}
                >
                  <div
                    className="w-full max-w-10 rounded-t-md shadow-sm ring-1 ring-orange-300/80"
                    style={{
                      height: barPx,
                      /* Inline fill — Tailwind bg-[var(--…)] can omit background in some builds */
                      background: `linear-gradient(to top, var(--structure-to), var(--structure-via), var(--structure-from))`,
                    }}
                    title={`${p.onTimePct}%`}
                  />
                </div>
                <span className="text-[10px] text-slate-400">{p.dayLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
