import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_LOCATIONS_ID } from "@/lib/dashboard/resolve-location";

type AssignmentRowDb = {
  id: string;
  smart_group_id: string;
  assignment_type: "time_clock" | "schedule";
  time_clock_id: string | null;
  location_id: string | null;
};

export type AssignmentRow = {
  id: string;
  assignment_type: "time_clock" | "schedule";
  time_clock_id: string | null;
  location_id: string | null;
};

export type SmartGroupRow = {
  id: string;
  segment_id: string;
  name: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
};

export type GroupSegmentRow = {
  id: string;
  name: string;
  color_token: string;
  sort_order: number;
  location_id: string | null;
  created_at: string;
};

export type SmartGroupsPayload = {
  segments: {
    id: string;
    name: string;
    colorToken: string;
    sortOrder: number;
    locationId: string | null;
    groups: {
      id: string;
      name: string;
      sortOrder: number;
      createdByLabel: string;
      connectedLabel: string;
      assignmentsSummary: string;
      assignments: {
        id: string;
        type: "time_clock" | "schedule";
        timeClockId: string | null;
        timeClockName: string | null;
        locationId: string | null;
        locationName: string | null;
      }[];
      adminSummary: string;
      adminIds: string[];
      memberIds: string[];
      memberCount: number;
      eligibleCount: number;
    }[];
  }[];
  employeesForPickers: {
    id: string;
    displayName: string;
    locationId: string | null;
  }[];
  timeClocks: { id: string; name: string; locationId: string; locationName: string }[];
  locations: { id: string; name: string }[];
};

function displayName(full: string, first: string | null, last: string | null): string {
  const f = first?.trim();
  const l = last?.trim();
  if (f && l) return `${f} ${l}`;
  if (f) return f;
  return full?.trim() || "—";
}

export async function loadSmartGroupsPayload(
  supabase: SupabaseClient,
  opts: { scopeLocationIds: string[]; scopeAll: boolean; selectedLocationId: string | null },
): Promise<{ data: SmartGroupsPayload | null; error: string | null }> {
  const { scopeAll, selectedLocationId } = opts;
  const scopeLocationIds = opts.scopeLocationIds.filter(
    (id) => Boolean(id) && id !== ALL_LOCATIONS_ID,
  );

  let segQuery = supabase.from("group_segments").select("*").order("sort_order", { ascending: true });

  if (scopeAll && scopeLocationIds.length > 0) {
    const ors = [
      "location_id.is.null",
      ...scopeLocationIds.map((id) => `location_id.eq.${id}`),
    ];
    segQuery = segQuery.or(ors.join(","));
  } else if (!scopeAll && selectedLocationId && selectedLocationId !== ALL_LOCATIONS_ID) {
    segQuery = segQuery.or(`location_id.is.null,location_id.eq.${selectedLocationId}`);
  }

  const { data: segmentRows, error: segErr } = await segQuery;
  if (segErr) {
    return { data: null, error: segErr.message };
  }

  const segments = (segmentRows ?? []) as GroupSegmentRow[];
  const segmentIds = segments.map((s) => s.id);
  if (segmentIds.length === 0) {
    const empty = await emptyPickers(supabase, {
      scopeAll,
      selectedLocationId,
      scopeLocationIds,
    });
    return {
      data: {
        segments: [],
        employeesForPickers: empty.employees,
        timeClocks: empty.timeClocks,
        locations: empty.locations,
      },
      error: null,
    };
  }

  const { data: groupRows, error: gErr } = await supabase
    .from("smart_groups")
    .select("*")
    .in("segment_id", segmentIds)
    .order("sort_order", { ascending: true });

  if (gErr) {
    return { data: null, error: gErr.message };
  }

  const groups = (groupRows ?? []) as SmartGroupRow[];
  const groupIds = groups.map((g) => g.id);

  const [memRes, admRes, asgRes, empRes, clockRes, locRes] = await Promise.all([
    groupIds.length
      ? supabase.from("smart_group_members").select("smart_group_id, employee_id").in("smart_group_id", groupIds)
      : Promise.resolve({ data: [] as { smart_group_id: string; employee_id: string }[], error: null }),
    groupIds.length
      ? supabase.from("smart_group_admins").select("smart_group_id, employee_id").in("smart_group_id", groupIds)
      : Promise.resolve({ data: [] as { smart_group_id: string; employee_id: string }[], error: null }),
    groupIds.length
      ? supabase.from("smart_group_assignments").select("*").in("smart_group_id", groupIds)
      : Promise.resolve({ data: [] as AssignmentRow[], error: null }),
    supabase
      .from("employees")
      .select("id, full_name, first_name, last_name, location_id, status")
      .not("status", "eq", "archived"),
    supabase.from("time_clocks").select("id, name, location_id").eq("status", "active"),
    supabase.from("locations").select("id, name").order("sort_order", { ascending: true }),
  ]);

  if (memRes.error) return { data: null, error: memRes.error.message };
  if (admRes.error) return { data: null, error: admRes.error.message };
  if (asgRes.error) return { data: null, error: asgRes.error.message };
  if (empRes.error) return { data: null, error: empRes.error.message };
  if (clockRes.error) return { data: null, error: clockRes.error.message };
  if (locRes.error) return { data: null, error: locRes.error.message };

  const memByGroup = new Map<string, string[]>();
  for (const r of memRes.data ?? []) {
    const arr = memByGroup.get(r.smart_group_id) ?? [];
    arr.push(r.employee_id);
    memByGroup.set(r.smart_group_id, arr);
  }

  const admByGroup = new Map<string, string[]>();
  for (const r of admRes.data ?? []) {
    const arr = admByGroup.get(r.smart_group_id) ?? [];
    arr.push(r.employee_id);
    admByGroup.set(r.smart_group_id, arr);
  }

  const asgByGroup = new Map<string, AssignmentRow[]>();
  for (const r of asgRes.data ?? []) {
    const row = r as AssignmentRowDb;
    const arr = asgByGroup.get(row.smart_group_id) ?? [];
    arr.push({
      id: row.id,
      assignment_type: row.assignment_type,
      time_clock_id: row.time_clock_id,
      location_id: row.location_id,
    });
    asgByGroup.set(row.smart_group_id, arr);
  }

  const empRows = (empRes.data ?? []) as {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    location_id: string | null;
    status: string;
  }[];

  const empMap = new Map(empRows.map((e) => [e.id, e]));
  const locMap = new Map((locRes.data ?? []).map((l) => [l.id as string, l.name as string]));

  const clocksRaw = (clockRes.data ?? []) as { id: string; name: string; location_id: string }[];
  const clockMap = new Map(clocksRaw.map((c) => [c.id, c]));

  const scopedEmployees = empRows.filter((e) => {
    if (scopeAll) {
      return !e.location_id || scopeLocationIds.includes(e.location_id);
    }
    return e.location_id === selectedLocationId || !e.location_id;
  });

  const employeesForPickers = scopedEmployees.map((e) => ({
    id: e.id,
    displayName: displayName(e.full_name, e.first_name, e.last_name),
    locationId: e.location_id,
  }));

  const timeClocks = clocksRaw
    .filter((c) => {
      if (scopeAll) {
        return scopeLocationIds.length === 0 || scopeLocationIds.includes(c.location_id);
      }
      return c.location_id === selectedLocationId;
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      locationId: c.location_id,
      locationName: locMap.get(c.location_id) ?? "—",
    }));

  const locations = (locRes.data ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
  }));

  function eligibleEmployeesForSegment(segmentLocationId: string | null): typeof empRows {
    return empRows.filter((e) => {
      if (e.status === "archived") return false;
      if (segmentLocationId) {
        return e.location_id === segmentLocationId;
      }
      if (scopeAll) {
        return !e.location_id || scopeLocationIds.includes(e.location_id);
      }
      return e.location_id === selectedLocationId || !e.location_id;
    });
  }

  function summarizeAssignments(rows: AssignmentRow[]): {
    text: string;
    list: SmartGroupsPayload["segments"][0]["groups"][0]["assignments"];
  } {
    if (!rows.length) {
      return { text: "None", list: [] };
    }
    const parts: string[] = [];
    const list: SmartGroupsPayload["segments"][0]["groups"][0]["assignments"] = [];
    for (const a of rows) {
      if (a.assignment_type === "time_clock" && a.time_clock_id) {
        const c = clockMap.get(a.time_clock_id);
        const nm = c ? `${c.name}` : "Time clock";
        parts.push(nm);
        list.push({
          id: a.id,
          type: "time_clock",
          timeClockId: a.time_clock_id,
          timeClockName: c?.name ?? null,
          locationId: null,
          locationName: null,
        });
      } else if (a.assignment_type === "schedule" && a.location_id) {
        const ln = locMap.get(a.location_id) ?? "Store";
        parts.push(`Schedule: ${ln}`);
        list.push({
          id: a.id,
          type: "schedule",
          timeClockId: null,
          timeClockName: null,
          locationId: a.location_id,
          locationName: ln,
        });
      }
    }
    const text =
      parts.length === 0
        ? "None"
        : parts.length === 1
          ? "1 selected"
          : parts.length === 2
            ? parts.join(" · ")
            : `${parts.length} selected`;
    return { text, list };
  }

  function adminSummary(adminIds: string[]): string {
    if (!adminIds.length) return "—";
    const names = adminIds
      .map((id) => {
        const e = empMap.get(id);
        return e ? displayName(e.full_name, e.first_name, e.last_name) : null;
      })
      .filter(Boolean) as string[];
    if (!names.length) return "—";
    if (names.length <= 2) return names.join(", ");
    return `${names[0]}, +${names.length - 1}`;
  }

  const groupsBySeg = new Map<string, SmartGroupRow[]>();
  for (const g of groups) {
    const arr = groupsBySeg.get(g.segment_id) ?? [];
    arr.push(g);
    groupsBySeg.set(g.segment_id, arr);
  }

  const payload: SmartGroupsPayload = {
    segments: segments.map((seg) => {
      const elig = eligibleEmployeesForSegment(seg.location_id);
      const eligCount = elig.length;
      const sglist = (groupsBySeg.get(seg.id) ?? []).map((g) => {
        const memberIds = memByGroup.get(g.id) ?? [];
        const adminIds = admByGroup.get(g.id) ?? [];
        const asg = asgByGroup.get(g.id) ?? [];
        const { text: assignmentsSummary, list: assignments } = summarizeAssignments(asg);
        const creator = g.created_by ? empMap.get(g.created_by) : undefined;
        const createdByLabel = creator
          ? displayName(creator.full_name, creator.first_name, creator.last_name)
          : "System";

        return {
          id: g.id,
          name: g.name,
          sortOrder: g.sort_order,
          createdByLabel,
          connectedLabel: `${memberIds.length} / ${eligCount}`,
          assignmentsSummary,
          assignments,
          adminSummary: adminSummary(adminIds),
          adminIds,
          memberIds,
          memberCount: memberIds.length,
          eligibleCount: eligCount,
        };
      });
      return {
        id: seg.id,
        name: seg.name,
        colorToken: seg.color_token,
        sortOrder: seg.sort_order,
        locationId: seg.location_id,
        groups: sglist,
      };
    }),
    employeesForPickers,
    timeClocks,
    locations,
  };

  return { data: payload, error: null };
}

async function emptyPickers(
  supabase: SupabaseClient,
  opts: { scopeAll: boolean; selectedLocationId: string | null; scopeLocationIds: string[] },
): Promise<{
  employees: SmartGroupsPayload["employeesForPickers"];
  timeClocks: SmartGroupsPayload["timeClocks"];
  locations: SmartGroupsPayload["locations"];
}> {
  const { scopeAll, selectedLocationId, scopeLocationIds } = opts;

  const [empRes, clockRes, locRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, first_name, last_name, location_id, status")
      .not("status", "eq", "archived"),
    supabase.from("time_clocks").select("id, name, location_id").eq("status", "active"),
    supabase.from("locations").select("id, name").order("sort_order", { ascending: true }),
  ]);

  const empRows = (empRes.data ?? []) as {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    location_id: string | null;
  }[];

  const scoped = empRows.filter((e) => {
    if (scopeAll) {
      return !e.location_id || scopeLocationIds.includes(e.location_id);
    }
    return e.location_id === selectedLocationId || !e.location_id;
  });

  const locMap = new Map((locRes.data ?? []).map((l) => [l.id as string, l.name as string]));

  const clocksRaw = (clockRes.data ?? []) as { id: string; name: string; location_id: string }[];
  const filteredClocks = clocksRaw.filter((c) => {
    if (scopeAll) {
      return scopeLocationIds.length === 0 || scopeLocationIds.includes(c.location_id);
    }
    return c.location_id === selectedLocationId;
  });

  return {
    employees: scoped.map((e) => ({
      id: e.id,
      displayName: displayName(e.full_name, e.first_name, e.last_name),
      locationId: e.location_id,
    })),
    timeClocks: filteredClocks.map((c) => ({
      id: c.id,
      name: c.name,
      locationId: c.location_id,
      locationName: locMap.get(c.location_id) ?? "—",
    })),
    locations: (locRes.data ?? []).map((l) => ({ id: l.id as string, name: l.name as string })),
  };
}
