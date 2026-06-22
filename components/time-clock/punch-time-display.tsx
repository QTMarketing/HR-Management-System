"use client";

import { Moon } from "lucide-react";
import {
  formatPunchDateTimeLocal,
  formatPunchTimeLocal,
  isLateNightLocalTime,
  LATE_NIGHT_PUNCH_TITLE,
} from "@/lib/time-clock/late-night-punch";

type Props = {
  iso: string | null | undefined;
  /** `time` = 7:38 AM (timecard). `datetime` = May 11, 7:38 AM (punch table). */
  variant?: "time" | "datetime";
  className?: string;
  fallback?: string;
};

export function PunchTimeDisplay({
  iso,
  variant = "time",
  className = "",
  fallback = "—",
}: Props) {
  if (!iso) {
    return <span className={className}>{fallback}</span>;
  }

  const lateNight = isLateNightLocalTime(iso);
  const label = variant === "datetime" ? formatPunchDateTimeLocal(iso) : formatPunchTimeLocal(iso);

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 ${className}`}
      title={lateNight ? LATE_NIGHT_PUNCH_TITLE : undefined}
    >
      {lateNight ? (
        <Moon
          className="h-3.5 w-3.5 shrink-0 text-blue-700"
          aria-hidden
          strokeWidth={2.25}
        />
      ) : null}
      <span className="min-w-0 truncate tabular-nums">{label}</span>
      {lateNight ? <span className="sr-only"> (late night)</span> : null}
    </span>
  );
}
