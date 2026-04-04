import { EllipsisTd } from "@/components/ui/ellipsis-td";
import { SECURITY_AUDIT_ACTIONS } from "@/lib/audit/security-audit";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ACTION_LABEL: Record<string, string> = {
  [SECURITY_AUDIT_ACTIONS.ADMIN_ACCESS_UPDATED]: "Admin permissions changed",
  [SECURITY_AUDIT_ACTIONS.EMPLOYEE_PROMOTED_STORE_MANAGER]: "Promoted to Store Manager",
  [SECURITY_AUDIT_ACTIONS.LOCATION_STORE_LEAD_CHANGED]: "Store lead changed",
  [SECURITY_AUDIT_ACTIONS.ORGANIZATION_OWNER_CHANGED]: "Organization owner changed",
  [SECURITY_AUDIT_ACTIONS.EMPLOYEE_ARCHIVED]: "User archived",
  [SECURITY_AUDIT_ACTIONS.TIME_ENTRY_ARCHIVED]: "Time punch archived",
  [SECURITY_AUDIT_ACTIONS.TIME_ENTRY_APPROVED]: "Time punch approved",
  [SECURITY_AUDIT_ACTIONS.TIME_ENTRY_UNAPPROVED]: "Time punch unapproved",
  [SECURITY_AUDIT_ACTIONS.TIME_ENTRY_ADJUSTED]: "Time punch times edited",
  [SECURITY_AUDIT_ACTIONS.TIME_OFF_RECORDED]: "Time off recorded",
};

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default async function SecurityAuditPage() {
  await requirePermission(PERMISSIONS.ORG_OWNER);

  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("security_audit_events")
    .select("id, created_at, actor_employee_id, action, target_employee_id, location_id, metadata")
    .order("created_at", { ascending: false })
    .limit(150);

  const migrationHint = (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      Run migration{" "}
      <code className="rounded bg-amber-100/80 px-1">018_security_audit_log.sql</code> in Supabase.
    </p>
  );

  if (error?.message?.includes("security_audit_events") || error?.code === "42P01") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Security audit</h1>
        {migrationHint}
      </div>
    );
  }

  const ids = new Set<string>();
  for (const r of rows ?? []) {
    const rec = r as {
      actor_employee_id?: string | null;
      target_employee_id?: string | null;
      metadata?: Record<string, unknown>;
    };
    if (rec.actor_employee_id) ids.add(rec.actor_employee_id);
    if (rec.target_employee_id) ids.add(rec.target_employee_id);
    const prev = rec.metadata?.previous_manager_employee_id;
    const next = rec.metadata?.new_manager_employee_id;
    if (typeof prev === "string") ids.add(prev);
    if (typeof next === "string") ids.add(next);
  }

  const nameById = new Map<string, string>();
  if (ids.size > 0) {
    const { data: empRows } = await supabase
      .from("employees")
      .select("id, full_name")
      .in("id", [...ids]);
    for (const e of empRows ?? []) {
      const er = e as { id: string; full_name: string };
      nameById.set(er.id, er.full_name ?? er.id);
    }
  }

  const locIds = [...new Set((rows ?? []).map((r) => (r as { location_id?: string | null }).location_id).filter(Boolean))] as string[];
  const locNameById = new Map<string, string>();
  if (locIds.length > 0) {
    const { data: locs } = await supabase.from("locations").select("id, name").in("id", locIds);
    for (const l of locs ?? []) {
      const lr = l as { id: string; name: string };
      locNameById.set(lr.id, lr.name);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Security audit</h1>
        <p className="mt-1 text-sm text-slate-600">
          Record of org-owner actions: permission presets, promotions, and store lead assignments.
        </p>
      </div>

      {error ? (
        <>
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error.message}
          </p>
          {migrationHint}
        </>
      ) : (rows ?? []).length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No events yet. Changes from Owners will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[880px] w-full table-auto text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="whitespace-nowrap px-4 py-3">When</th>
                <th className="whitespace-nowrap px-4 py-3">Action</th>
                <th className="whitespace-nowrap px-4 py-3">Who</th>
                <th className="whitespace-nowrap px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {(rows ?? []).map((raw, i) => {
                const r = raw as {
                  id: string;
                  created_at: string;
                  action: string;
                  actor_employee_id: string | null;
                  target_employee_id: string | null;
                  location_id: string | null;
                  metadata: Record<string, unknown> | null;
                };
                const meta = r.metadata ?? {};
                const actor =
                  (r.actor_employee_id && nameById.get(r.actor_employee_id)) ||
                  (r.actor_employee_id ? r.actor_employee_id.slice(0, 8) + "…" : "—");
                let detail = "";
                if (r.action === SECURITY_AUDIT_ACTIONS.ADMIN_ACCESS_UPDATED) {
                  const t = r.target_employee_id
                    ? nameById.get(r.target_employee_id) ?? r.target_employee_id
                    : "—";
                  detail = `${t}: ${String(meta.before_summary ?? "—")} → ${String(meta.after_summary ?? "—")}`;
                } else if (r.action === SECURITY_AUDIT_ACTIONS.EMPLOYEE_PROMOTED_STORE_MANAGER) {
                  const t = r.target_employee_id
                    ? nameById.get(r.target_employee_id) ?? r.target_employee_id
                    : "—";
                  detail = `${t} (${String(meta.previous_role ?? "?")} → Store Manager)`;
                } else if (r.action === SECURITY_AUDIT_ACTIONS.LOCATION_STORE_LEAD_CHANGED) {
                  const ln =
                    (typeof meta.location_name === "string" && meta.location_name) ||
                    (r.location_id ? locNameById.get(r.location_id) : "") ||
                    "Store";
                  const prevId = meta.previous_manager_employee_id as string | null | undefined;
                  const nextId = meta.new_manager_employee_id as string | null | undefined;
                  const prev =
                    prevId == null ? "none" : nameById.get(prevId) ?? prevId.slice(0, 8) + "…";
                  const next =
                    nextId == null ? "none" : nameById.get(nextId) ?? nextId.slice(0, 8) + "…";
                  detail = `${ln}: ${prev} → ${next}`;
                } else if (r.action === SECURITY_AUDIT_ACTIONS.ORGANIZATION_OWNER_CHANGED) {
                  const t = r.target_employee_id
                    ? nameById.get(r.target_employee_id) ?? r.target_employee_id
                    : "—";
                  const granted = Boolean(meta.organization_owner);
                  detail = `${t}: ${granted ? "granted" : "removed"} (${String(meta.previous_role ?? "?")} → ${String(meta.new_role ?? "?")})`;
                } else if (r.action === SECURITY_AUDIT_ACTIONS.EMPLOYEE_ARCHIVED) {
                  const t = r.target_employee_id
                    ? nameById.get(r.target_employee_id) ?? r.target_employee_id
                    : "—";
                  detail = `${t} (${String(meta.previous_status ?? "?")} → archived; ${String(meta.full_name ?? "")})`;
                } else if (r.action === SECURITY_AUDIT_ACTIONS.TIME_ENTRY_ARCHIVED) {
                  const emp = r.target_employee_id
                    ? nameById.get(r.target_employee_id) ?? r.target_employee_id
                    : "—";
                  const loc =
                    (r.location_id && locNameById.get(r.location_id)) || r.location_id || "—";
                  detail = `Punch ${String(meta.time_entry_id ?? "").slice(0, 8)}… · ${emp} · ${loc}`;
                } else if (
                  r.action === SECURITY_AUDIT_ACTIONS.TIME_ENTRY_APPROVED ||
                  r.action === SECURITY_AUDIT_ACTIONS.TIME_ENTRY_UNAPPROVED
                ) {
                  const emp = r.target_employee_id
                    ? nameById.get(r.target_employee_id) ?? r.target_employee_id
                    : "—";
                  const loc =
                    (r.location_id && locNameById.get(r.location_id)) || r.location_id || "—";
                  detail = `Punch ${String(meta.time_entry_id ?? "").slice(0, 8)}… · ${emp} · ${loc}`;
                } else if (r.action === SECURITY_AUDIT_ACTIONS.TIME_ENTRY_ADJUSTED) {
                  const emp = r.target_employee_id
                    ? nameById.get(r.target_employee_id) ?? r.target_employee_id
                    : "—";
                  const loc =
                    (r.location_id && locNameById.get(r.location_id)) || r.location_id || "—";
                  detail = `Punch ${String(meta.time_entry_id ?? "").slice(0, 8)}… · ${emp} · ${loc}`;
                } else if (r.action === SECURITY_AUDIT_ACTIONS.TIME_OFF_RECORDED) {
                  const emp = r.target_employee_id
                    ? nameById.get(r.target_employee_id) ?? r.target_employee_id
                    : "—";
                  const loc =
                    (r.location_id && locNameById.get(r.location_id)) || r.location_id || "—";
                  const typ = typeof meta.time_off_type === "string" ? meta.time_off_type : "—";
                  detail = `${typ} · ${emp} · ${loc} · ${String(meta.time_off_record_id ?? "").slice(0, 8)}…`;
                } else {
                  detail = JSON.stringify(meta);
                }
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtWhen(r.created_at)}</td>
                    <EllipsisTd
                      maxClass="max-w-[18rem]"
                      title={ACTION_LABEL[r.action] ?? r.action}
                      className="font-medium text-slate-900"
                    >
                      {ACTION_LABEL[r.action] ?? r.action}
                    </EllipsisTd>
                    <EllipsisTd maxClass="max-w-[14rem]" title={actor}>
                      <span className="text-slate-700">{actor}</span>
                    </EllipsisTd>
                    <EllipsisTd maxClass="max-w-[36rem]" title={detail}>
                      <span className="text-slate-700">{detail}</span>
                    </EllipsisTd>
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
