/**
 * KPI strip: colored icon circles only (tiles use white surfaces).
 * Metric cards: flat pastel fills.
 */
export const dashboardKpiVariants = {
  emerald: { iconCircle: "bg-emerald-500" },
  amber: { iconCircle: "bg-amber-600" },
  orange: { iconCircle: "bg-orange-500" },
  rose: { iconCircle: "bg-rose-500" },
  sky: { iconCircle: "bg-sky-500" },
  violet: { iconCircle: "bg-violet-600" },
} as const;

export type DashboardKpiVariant = keyof typeof dashboardKpiVariants;

export const metricCardPalette = {
  coral: "border-0 bg-orange-50 shadow-sm",
  sky: "border-0 bg-sky-50 shadow-sm",
  mint: "border-0 bg-emerald-50 shadow-sm",
  lilac: "border-0 bg-violet-50 shadow-sm",
} as const;

export type MetricCardPalette = keyof typeof metricCardPalette;
