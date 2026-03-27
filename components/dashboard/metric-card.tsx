import {
  type MetricCardPalette,
  metricCardPalette,
} from "@/lib/ui/dashboard-palette";

type MetricCardProps = {
  title: string;
  value: string;
  hint?: string;
  trend?: { value: string; positive: boolean };
  palette?: MetricCardPalette;
  emphasis?: "default" | "structure";
};

export function MetricCard({
  title,
  value,
  hint,
  trend,
  palette = "coral",
  emphasis = "default",
}: MetricCardProps) {
  const surface =
    emphasis === "structure"
      ? "rounded-2xl border-0 bg-orange-50 p-5 shadow-sm"
      : `rounded-2xl ${metricCardPalette[palette]} p-5`;

  return (
    <div className={surface}>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {trend && (
        <p
          className={`mt-2 text-sm font-medium ${
            trend.positive ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {trend.value}
        </p>
      )}
    </div>
  );
}
