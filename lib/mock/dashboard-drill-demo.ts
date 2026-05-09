import type { DashboardDrillKind, DashboardDrillRow } from "@/lib/dashboard/drill-down-types";

const DEMO_PEOPLE = [
  { id: "demo-1", name: "Alex P.", sub: "15 min late" },
  { id: "demo-2", name: "Jamie L.", sub: "On time" },
  { id: "demo-3", name: "Riley K.", sub: "8 min late" },
  { id: "demo-4", name: "Sam D.", sub: "32 min late" },
  { id: "demo-5", name: "Morgan T.", sub: "45 min past shift end" },
  { id: "demo-6", name: "Casey R.", sub: "Since 8:02 AM" },
] as const;

/** Synthetic roster when the dashboard is running on demo KPIs (no live DB). */
export function demoDashboardDrillRows(
  kind: DashboardDrillKind,
  storeLabel: string,
): DashboardDrillRow[] {
  const store = storeLabel.split("—")[0]?.trim() || storeLabel || "Store";
  if (kind === "avg_weekly_hours") return [];

  if (kind === "total_employees") {
    return DEMO_PEOPLE.map((p, i) => ({
      id: `demo-total-${i}`,
      fullName: p.name,
      subtitle: `${store} · Active`,
    }));
  }
  if (kind === "scheduled_today") {
    return DEMO_PEOPLE.slice(0, 4).map((p, i) => ({
      id: `demo-sch-${i}`,
      fullName: p.name,
      subtitle: `${store} · Shift 9:00 AM`,
    }));
  }
  if (kind === "clocked_in_now") {
    return DEMO_PEOPLE.slice(0, 3).map((p, i) => ({
      id: `demo-in-${i}`,
      fullName: p.name,
      subtitle: `${store} · ${p.sub}`,
    }));
  }
  if (kind === "late_clock_ins") {
    return DEMO_PEOPLE.filter((p) => p.sub.includes("late")).map((p, i) => ({
      id: `demo-late-in-${i}`,
      fullName: p.name,
      subtitle: `${store} · ${p.sub}`,
    }));
  }
  if (kind === "late_clock_outs") {
    return [{ id: "demo-lo-1", fullName: "Morgan T.", subtitle: `${store} · ${DEMO_PEOPLE[4]!.sub}` }];
  }
  return [];
}
