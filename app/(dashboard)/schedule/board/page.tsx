import { cookies } from "next/headers";
import { ScheduleWeekBoard } from "@/components/schedule/schedule-week-board";
import { draftPublishCount, type ShiftForBoard } from "@/lib/schedule/board-model";
import { locationsForSession } from "@/lib/dashboard/locations-for-session";
import {
  isAllLocations,
  resolveSelectedLocationId,
  type LocationRow,
} from "@/lib/dashboard/resolve-location";
import {
  addDays,
  formatWeekQueryParam,
  mondayOfWeekContaining,
  parseWeekMondayParam,
} from "@/lib/schedule/week";
import { DEMO_LOCATIONS } from "@/lib/mock/dashboard-demo";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ week?: string }>;
};

function pickEmployee(raw: unknown): { full_name: string; role: string } {
  if (raw == null) return { full_name: "—", role: "—" };
  const emp = Array.isArray(raw) ? raw[0] : raw;
  if (!emp || typeof emp !== "object") return { full_name: "—", role: "—" };
  const e = emp as { full_name?: string; role?: string };
  return { full_name: e.full_name ?? "—", role: e.role ?? "—" };
}

function pickGroup(raw: unknown): { name: string; sort_order: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { name?: string; sort_order?: number };
  if (typeof o.name !== "string") return null;
  return { name: o.name, sort_order: Number(o.sort_order) || 0 };
}

function pickJob(raw: unknown): { name: string; color_hex: string; sort_order: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { name?: string; color_hex?: string; sort_order?: number };
  if (typeof o.name !== "string") return null;
  return {
    name: o.name,
    color_hex: typeof o.color_hex === "string" ? o.color_hex : "#64748b",
    sort_order: Number(o.sort_order) || 0,
  };
}

/** Connecteam-style shift layers: board section + optional metadata layers. */
function pickBoardSectionAndExtras(raw: unknown): {
  sectionLabel: string | null;
  sectionSort: number;
  boardSectionLayerName: string | null;
  extraLayerLabels: string[];
} {
  const out = {
    sectionLabel: null as string | null,
    sectionSort: 99,
    boardSectionLayerName: null as string | null,
    extraLayerLabels: [] as string[],
  };
  if (raw == null) return out;
  const rows = Array.isArray(raw) ? raw : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const layerRaw = r.schedule_shift_layers;
    const optRaw = r.schedule_shift_layer_options;
    const layer = Array.isArray(layerRaw) ? layerRaw[0] : layerRaw;
    const opt = Array.isArray(optRaw) ? optRaw[0] : optRaw;
    if (!layer || typeof layer !== "object" || !opt || typeof opt !== "object") continue;
    const l = layer as { name?: string; sort_order?: number; is_board_section?: boolean };
    const o = opt as { label?: string; sort_order?: number };
    const layerName = typeof l.name === "string" ? l.name : "";
    const isSection = l.is_board_section === true;
    const label = typeof o.label === "string" ? o.label : "";
    const sort = Number(o.sort_order) || 0;
    if (isSection && label) {
      out.sectionLabel = label;
      out.sectionSort = sort;
      out.boardSectionLayerName = layerName || null;
    } else if (!isSection && label && layerName) {
      out.extraLayerLabels.push(`${layerName}: ${label}`);
    }
  }
  return out;
}

type ShiftRow = {
  id: string;
  employee_id: string;
  location_id: string;
  shift_start: string;
  shift_end: string;
  notes: string | null;
  is_published: boolean | null;
  slots_total: number | null;
  notify_badge_count: number | null;
  shift_group_id: string | null;
  job_id: string | null;
  schedule_shift_groups: unknown;
  schedule_jobs: unknown;
  employees: unknown;
  shift_layer_values: unknown;
};

export default async function ScheduleBoardPage({ searchParams }: PageProps) {
  await requirePermission(PERMISSIONS.SCHEDULE_VIEW);

  const sp = await searchParams;
  const weekMonday = parseWeekMondayParam(sp.week);
  const weekEnd = addDays(weekMonday, 7);

  const supabase = await createSupabaseServerClient();

  const { data: locRows } = await supabase
    .from("locations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  let rawLocations: LocationRow[] = (locRows ?? []).map((r) => ({ id: r.id, name: r.name }));
  if (rawLocations.length === 0) {
    rawLocations = DEMO_LOCATIONS;
  }
  const locations = locationsForSession(rawLocations);
  const locNameById = new Map((locRows ?? []).map((l) => [l.id, l.name] as const));

  const cookieStore = await cookies();
  const locationId = resolveSelectedLocationId(
    locations,
    cookieStore.get("hr_location_id")?.value,
  );
  const scopeAll = isAllLocations(locationId);
  const locationLabel =
    locations.find((l) => l.id === locationId)?.name ?? "Location";

  let shifts: ShiftForBoard[] = [];
  let errorMessage: string | null = null;

  try {
    let q = supabase
      .from("shifts")
      .select(
        `id, employee_id, location_id, shift_start, shift_end, notes,
         is_published, slots_total, notify_badge_count, shift_group_id, job_id,
         schedule_shift_groups ( name, sort_order ),
         schedule_jobs ( name, color_hex, sort_order ),
         employees!shifts_employee_id_fkey ( full_name, role ),
         shift_layer_values (
           layer_id,
           schedule_shift_layers ( name, sort_order, is_board_section ),
           schedule_shift_layer_options ( label, sort_order )
         )`,
      )
      .gte("shift_start", weekMonday.toISOString())
      .lt("shift_start", weekEnd.toISOString())
      .order("shift_start", { ascending: true });

    if (!scopeAll) {
      q = q.eq("location_id", locationId);
    }

    const { data, error } = await q;

    if (error) {
      errorMessage = error.message;
    } else if (data) {
      const rows = data as ShiftRow[];
      const ids = rows.map((r) => r.id);
      const assignMap = new Map<string, number>();
      if (ids.length > 0) {
        const { data: assignRows } = await supabase
          .from("shift_assignments")
          .select("shift_id")
          .in("shift_id", ids);
        for (const a of assignRows ?? []) {
          const sid = (a as { shift_id: string }).shift_id;
          assignMap.set(sid, (assignMap.get(sid) ?? 0) + 1);
        }
      }

      shifts = rows.map((row) => {
        const emp = pickEmployee(row.employees);
        const grp = pickGroup(row.schedule_shift_groups);
        const layers = pickBoardSectionAndExtras(row.shift_layer_values);
        const job = pickJob(row.schedule_jobs);
        const assignCount = assignMap.get(row.id) ?? (row.employee_id ? 1 : 0);
        const hasJob = row.job_id != null && job != null;
        const groupName =
          layers.sectionLabel ?? grp?.name ?? "Ungrouped shifts";
        const groupSort =
          layers.sectionLabel != null ? layers.sectionSort : (grp?.sort_order ?? 99);
        const boardSectionLayerName =
          layers.sectionLabel != null ? layers.boardSectionLayerName : null;
        return {
          id: row.id,
          employee_id: row.employee_id,
          location_id: row.location_id,
          shift_start: row.shift_start,
          shift_end: row.shift_end,
          notes: row.notes,
          employeeName: emp.full_name,
          employeeRole: emp.role,
          groupName,
          groupSort,
          boardSectionLayerName,
          extraLayerLabels: layers.extraLayerLabels,
          jobName: hasJob ? job.name : null,
          jobSort: hasJob ? job.sort_order : -1,
          jobColorHex: hasJob ? job.color_hex : "#94a3b8",
          isPublished: row.is_published !== false,
          slotsTotal: row.slots_total ?? 2,
          assignCount,
          notifyBadgeCount: row.notify_badge_count ?? 0,
        };
      });
    }
  } catch (e) {
    errorMessage =
      e instanceof Error ? e.message : "Could not load shifts (run migrations through 013).";
  }

  const publishDraftCount = draftPublishCount(shifts);

  const prevMonday = addDays(weekMonday, -7);
  const nextMonday = addDays(weekMonday, 7);
  const todayMonday = mondayOfWeekContaining(new Date());

  const qs = (d: Date) => {
    const w = formatWeekQueryParam(d);
    return `?week=${encodeURIComponent(w)}`;
  };

  const sunday = addDays(weekMonday, 6);
  const rangeLabel = `${weekMonday.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${sunday.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {errorMessage}
        </p>
      ) : null}

      <ScheduleWeekBoard
        weekMonday={weekMonday}
        weekParam={formatWeekQueryParam(weekMonday)}
        rangeLabel={rangeLabel}
        prevWeekHref={`/schedule/board${qs(prevMonday)}`}
        nextWeekHref={`/schedule/board${qs(nextMonday)}`}
        todayWeekHref={`/schedule/board${qs(todayMonday)}`}
        locationLabel={locationLabel}
        scopeAll={scopeAll}
        locationNamesById={locNameById}
        shifts={shifts}
        publishDraftCount={publishDraftCount}
      />
    </div>
  );
}
