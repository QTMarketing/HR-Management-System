import type { ReactNode } from "react";
import type { ActivityFeedItem } from "./activity-feed.types";

const statusDot = {
  ok: "bg-emerald-500",
  late: "bg-amber-500",
  info: "bg-sky-500",
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
  items: ActivityFeedItem[];
  emptyHint?: string | null;
  errorMessage?: string | null;
  /** Optional controls row (search / filters) rendered under the subtitle. */
  toolbar?: ReactNode;
  /** Pagination / summary row fixed below the scrollable list. */
  footer?: ReactNode;
  /** Override outer container classes (default: max-h-96 flex column). */
  className?: string;
};

export function ActivityFeed({
  items,
  emptyHint,
  errorMessage,
  toolbar,
  footer,
  className,
}: Props) {
  const outer =
    className ??
    "flex min-h-0 max-h-96 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm";
  return (
    <div className={outer}>
      <div className="shrink-0 border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Live activity</h2>
        <p className="text-xs text-slate-500">Recent events across your location</p>
        {toolbar ? <div className="mt-4">{toolbar}</div> : null}
      </div>

      {errorMessage ? (
        <p className="shrink-0 px-5 py-4 text-sm text-red-600">{errorMessage}</p>
      ) : items.length === 0 ? (
        <p className="shrink-0 px-5 py-4 text-sm text-slate-500">
          {emptyHint ??
            "No events yet. Add rows in Supabase or run the seed SQL in supabase/migrations/001_activity_events.sql."}
        </p>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${statusDot[item.status]}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {item.who}{" "}
                      <span className="font-normal text-slate-500">· {item.action}</span>
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-500" dateTime={item.occurredAt}>
                    {formatTime(item.occurredAt)}
                  </time>
                </li>
              ))}
            </ul>
          </div>
          {footer ? <div className="shrink-0">{footer}</div> : null}
        </>
      )}
    </div>
  );
}
