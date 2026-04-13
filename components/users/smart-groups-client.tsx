"use client";

import {
  createGroupSegment,
  createSmartGroup,
  deleteGroupSegment,
  deleteSmartGroup,
  setScheduleAssignment,
  setSmartGroupAdmin,
  setSmartGroupMember,
  setTimeClockAssignment,
} from "@/app/actions/smart-groups";
import type { SmartGroupsPayload } from "@/lib/smart-groups/load-data";
import { PRIMARY_ORANGE_CTA, SECONDARY_ORANGE_PILL } from "@/lib/ui/primary-orange-cta";
import { EllipsisTd } from "@/components/ui/ellipsis-td";
import { ChevronDown, ChevronRight, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

const DOT: Record<string, string> = {
  slate: "bg-slate-400",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  rose: "bg-rose-500",
  emerald: "bg-emerald-500",
};

function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = parts[0][0] ?? "?";
  const b = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (a + b).toUpperCase();
}

function CreatedByCell({ label }: { label: string }) {
  const isUnknown = !label.trim() || label === "System";
  const show = isUnknown ? "N/A" : label;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-slate-200/80 ${
          isUnknown ? "bg-slate-100 text-slate-500" : "bg-orange-100 text-orange-950"
        }`}
        aria-hidden
      >
        {isUnknown ? "—" : initialsFromLabel(label)}
      </span>
      <span className="min-w-0 truncate text-slate-700">{show}</span>
    </div>
  );
}

function AdminAvatarStack({
  adminIds,
  employees,
  onClick,
}: {
  adminIds: string[];
  employees: SmartGroupsPayload["employeesForPickers"];
  onClick: () => void;
}) {
  if (!adminIds.length) {
    return <span className="text-slate-400">—</span>;
  }
  const maxVisible = 3;
  const visible = adminIds.slice(0, maxVisible);
  const extra = adminIds.length - visible.length;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex max-w-full items-center gap-2 text-left transition-opacity hover:opacity-90"
    >
      <span className="flex shrink-0 -space-x-2">
        {visible.map((id) => {
          const name = employees.find((e) => e.id === id)?.displayName ?? "?";
          return (
            <span
              key={id}
              title={name}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-950 ring-2 ring-white"
            >
              {initialsFromLabel(name)}
            </span>
          );
        })}
      </span>
      {extra > 0 ? (
        <span className="shrink-0 text-sm font-medium tabular-nums text-slate-600">+{extra}</span>
      ) : null}
    </button>
  );
}

function assignmentTriggerLabel(group: SmartGroupsPayload["segments"][0]["groups"][0]): string {
  const n = group.assignments.length;
  if (n === 0) return "None";
  return `${n} selected`;
}

function assignmentTriggerTitle(group: SmartGroupsPayload["segments"][0]["groups"][0]): string {
  if (group.assignments.length === 0) return "No assignments — open Time Clock to choose clocks and stores.";
  return group.assignments
    .map((a) =>
      a.type === "time_clock"
        ? (a.timeClockName ? `${a.timeClockName} (${a.locationName ?? "Store"})` : "Time Clock")
        : a.locationName
          ? `Schedule: ${a.locationName}`
          : "Schedule",
    )
    .join(" · ");
}

type AssignPopoverState = { groupId: string; anchor: DOMRect };

type Props = {
  payload: SmartGroupsPayload;
  canManage: boolean;
  dbError: string | null;
  /** Deep link from Time Clock → Edit assignments */
  focusTimeClockId?: string | null;
};

export function SmartGroupsClient({
  payload,
  canManage,
  dbError,
  focusTimeClockId = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(payload.segments.map((s) => [s.id, true])),
  );
  const [query, setQuery] = useState("");
  const [collapseAll, setCollapseAll] = useState(false);

  const [segmentModal, setSegmentModal] = useState(false);
  const [groupModalSegmentId, setGroupModalSegmentId] = useState<string | null>(null);
  const [assignPopover, setAssignPopover] = useState<AssignPopoverState | null>(null);
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);
  const [adminsGroupId, setAdminsGroupId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return payload.segments;
    return payload.segments
      .map((seg) => ({
        ...seg,
        groups: seg.groups.filter(
          (g) =>
            g.name.toLowerCase().includes(q) ||
            seg.name.toLowerCase().includes(q) ||
            g.assignmentsSummary.toLowerCase().includes(q) ||
            g.assignments.some(
              (a) =>
                (a.timeClockName?.toLowerCase().includes(q) ?? false) ||
                (a.locationName?.toLowerCase().includes(q) ?? false),
            ),
        ),
      }))
      .filter((s) => s.groups.length > 0);
  }, [payload.segments, query]);

  const effectiveExpanded = (id: string) => (collapseAll ? false : expanded[id] !== false);

  const toggleSegment = (id: string) => {
    setCollapseAll(false);
    setExpanded((e) => ({ ...e, [id]: !effectiveExpanded(id) }));
  };

  const handleCollapseAll = () => {
    setCollapseAll(true);
    setExpanded(Object.fromEntries(payload.segments.map((s) => [s.id, false])));
  };

  if (dbError) {
    const suggest010 =
      /does not exist|relation|smart_group|group_segments/i.test(dbError);
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Smart groups</h1>
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {dbError}
        </p>
        {suggest010 ? (
          <p className="text-sm text-slate-600">
            If tables are missing, run{" "}
            <code className="rounded bg-slate-100 px-1">
              supabase/migrations/010_smart_groups.sql
            </code>{" "}
            in the Supabase SQL editor (after 009).
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            This message is the real error from the database — it is not always a missing migration.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Smart groups</h1>
        <p className="mt-1 text-sm text-slate-500">
          Segments and groups backed by Supabase. Assign groups to{" "}
          <Link href="/time-clock" className="font-medium text-orange-700 hover:text-orange-900">
            Time Clock
          </Link>{" "}
          and{" "}
          <Link href="/schedule" className="font-medium text-orange-700 hover:text-orange-900">
            Schedule
          </Link>
          . Mirrors{" "}
          <Link
            href="https://app.connecteam.com/#/index/groups/groups"
            className="font-medium text-orange-700 hover:text-orange-900"
            target="_blank"
            rel="noopener noreferrer"
          >
            Connecteam Groups
          </Link>
          .
        </p>
      </div>

      {focusTimeClockId ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/95 px-4 py-3 text-sm text-orange-950">
          <span className="font-semibold tracking-tight">
            {payload.timeClocks.find((t) => t.id === focusTimeClockId)?.name ?? "Time Clock"}
          </span>
          {" — "}
          Use each group’s <strong className="font-semibold">Assignments</strong> control to attach or detach this
          clock for who can clock in.
          {" "}
          <Link
            href="/time-clock"
            className="font-medium text-orange-900 underline underline-offset-2 hover:text-orange-950"
          >
            Back to Time Clock
          </Link>
        </div>
      ) : null}

      {segmentModal ? (
        <AddSegmentModal
          locations={payload.locations}
          nextSortOrder={payload.segments.length}
          canManage={canManage}
          onClose={() => setSegmentModal(false)}
          onCreated={() => {
            setSegmentModal(false);
            refresh();
          }}
        />
      ) : null}

      {groupModalSegmentId ? (
        <AddGroupModal
          segmentId={groupModalSegmentId}
          canManage={canManage}
          onClose={() => setGroupModalSegmentId(null)}
          onCreated={() => {
            setGroupModalSegmentId(null);
            refresh();
          }}
        />
      ) : null}

      {membersGroupId ? (
        <MembersModal
          group={payload.segments.flatMap((s) => s.groups).find((g) => g.id === membersGroupId)!}
          employees={payload.employeesForPickers}
          canManage={canManage}
          onClose={() => setMembersGroupId(null)}
          onChange={() => refresh()}
        />
      ) : null}

      {adminsGroupId ? (
        <AdminsModal
          group={payload.segments.flatMap((s) => s.groups).find((g) => g.id === adminsGroupId)!}
          employees={payload.employeesForPickers}
          canManage={canManage}
          onClose={() => setAdminsGroupId(null)}
          onChange={() => refresh()}
        />
      ) : null}

      {assignPopover ? (
        <AssignmentsDropdown
          group={payload.segments.flatMap((s) => s.groups).find((g) => g.id === assignPopover.groupId)!}
          anchor={assignPopover.anchor}
          timeClocks={payload.timeClocks}
          locations={payload.locations}
          canManage={canManage}
          onClose={() => setAssignPopover(null)}
          onChange={() => refresh()}
        />
      ) : null}

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleCollapseAll}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Collapse all
          </button>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[200px] max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search groups"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <button
              type="button"
              disabled={!canManage || pending}
              onClick={() => setSegmentModal(true)}
              className={`${SECONDARY_ORANGE_PILL} px-4 py-2.5 text-sm disabled:opacity-50`}
              title={canManage ? "Add segment" : "Requires users.manage permission"}
            >
              + Add segment
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No segments match search.</p>
          ) : (
            filtered.map((seg) => {
              const open = effectiveExpanded(seg.id);
              const count = seg.groups.length;
              const dot = DOT[seg.colorToken] ?? DOT.slate;
              return (
                <div key={seg.id}>
                  <div className="flex w-full items-center gap-2 px-2 sm:px-4">
                    <button
                      type="button"
                      onClick={() => toggleSegment(seg.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-4 py-3 text-left hover:bg-slate-50/80"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                        )}
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
                        <span className="truncate font-semibold text-slate-900">{seg.name}</span>
                        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
                          Segment
                        </span>
                        {seg.locationId ? (
                          <span className="truncate text-xs text-slate-400">
                            ·{" "}
                            {payload.locations.find((l) => l.id === seg.locationId)?.name ??
                              "Location"}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-sm text-slate-500">
                        {count} group{count === 1 ? "" : "s"}
                      </span>
                    </button>
                    {canManage ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete segment and all groups in it"
                        aria-label="Delete segment"
                        disabled={pending}
                        onClick={() => {
                          if (
                            confirm(
                              `Delete segment “${seg.name}” and all groups inside it? This cannot be undone.`,
                            )
                          ) {
                            startTransition(async () => {
                              const r = await deleteGroupSegment(seg.id);
                              if (!r.ok) alert(r.error);
                              else router.refresh();
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  {open ? (
                    <div className="overflow-x-auto px-2 pb-3">
                      <table className="min-w-[960px] w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <th className="w-10 px-2 py-3" aria-label="Select row" />
                            <th className="whitespace-nowrap px-3 py-3">Group name</th>
                            <th className="w-28 px-3 py-3 text-center">Connected</th>
                            <th className="min-w-[140px] px-3 py-3">Created by</th>
                            <th className="w-[150px] px-3 py-3 text-center">Assignments</th>
                            <th className="min-w-[160px] px-3 py-3">Administrated by</th>
                            {canManage ? <th className="w-10 px-3 py-3" /> : null}
                          </tr>
                        </thead>
                        <tbody className="text-slate-800">
                          {seg.groups.map((g, i) => (
                            <tr
                              key={g.id}
                              className={`border-b border-slate-100 ${
                                i % 2 === 1 ? "bg-slate-50/50" : ""
                              }`}
                            >
                              <td className="px-2 py-2.5 align-middle">
                                <input
                                  type="checkbox"
                                  disabled
                                  className="rounded-sm border-slate-300 text-orange-600"
                                  aria-label={`Select ${g.name}`}
                                />
                              </td>
                              <EllipsisTd
                                padClass="px-3 py-2.5 align-middle"
                                maxClass="max-w-[18rem]"
                                title={g.name}
                                className="font-medium text-slate-900"
                              >
                                {g.name}
                              </EllipsisTd>
                              <td className="px-3 py-2.5 text-center align-middle tabular-nums">
                                <button
                                  type="button"
                                  className="hover:underline text-orange-700"
                                  onClick={() => setMembersGroupId(g.id)}
                                >
                                  <span className="font-medium">{g.memberCount}</span>
                                  <span className="mx-1 font-normal text-slate-400">/</span>
                                  <span className="font-medium">{g.eligibleCount}</span>
                                </button>
                              </td>
                              <td className="px-3 py-2.5 align-middle">
                                <CreatedByCell label={g.createdByLabel} />
                              </td>
                              <td className="px-3 py-2.5 text-center align-middle">
                                <button
                                  type="button"
                                  title={assignmentTriggerTitle(g)}
                                  onClick={(e) => {
                                    setAssignPopover({
                                      groupId: g.id,
                                      anchor: (e.currentTarget as HTMLButtonElement).getBoundingClientRect(),
                                    });
                                  }}
                                  className="inline-flex w-full max-w-[11rem] items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-center text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300"
                                >
                                  <span className="min-w-0 truncate">{assignmentTriggerLabel(g)}</span>
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                </button>
                              </td>
                              <td className="px-3 py-2.5 align-middle">
                                <AdminAvatarStack
                                  adminIds={g.adminIds}
                                  employees={payload.employeesForPickers}
                                  onClick={() => setAdminsGroupId(g.id)}
                                />
                              </td>
                              {canManage ? (
                                <td className="px-3 py-2.5 text-right align-middle">
                                  <button
                                    type="button"
                                    className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                    title="Delete group"
                                    disabled={pending}
                                    onClick={() => {
                                      if (confirm(`Delete group “${g.name}”?`)) {
                                        startTransition(async () => {
                                          const r = await deleteSmartGroup(g.id);
                                          if (!r.ok) alert(r.error);
                                          else router.refresh();
                                        });
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-3 flex justify-center px-2">
                        <button
                          type="button"
                          disabled={!canManage || pending}
                          onClick={() => setGroupModalSegmentId(seg.id)}
                          className={`${SECONDARY_ORANGE_PILL} px-4 py-2 text-sm disabled:opacity-50`}
                          title={canManage ? "Add group" : "Requires users.manage permission"}
                        >
                          + Add group
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Time Clock &amp; Schedule</p>
        <p className="mt-1">
          <strong>Assignments</strong> control which clocks and which store schedules use this group for
          access targeting. Employee <strong>membership</strong> is stored in{" "}
          <code className="rounded bg-white px-1">smart_group_members</code>. Changes apply after
          refresh; tie clock-in rules to these assignments when you enforce who can clock in from the app.
        </p>
      </div>

      {!canManage ? (
        <p className="text-xs text-slate-500">
          Editing requires <code className="rounded bg-slate-100 px-1">users.manage</code> when{" "}
          <code className="rounded bg-slate-100 px-1">RBAC_ENABLED=true</code>.
        </p>
      ) : null}
    </div>
  );
}

function AddSegmentModal({
  locations,
  nextSortOrder,
  canManage,
  onClose,
  onCreated,
}: {
  locations: SmartGroupsPayload["locations"];
  nextSortOrder: number;
  canManage: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("slate");
  const [loc, setLoc] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!canManage) return;
    setBusy(true);
    const r = await createGroupSegment(
      name,
      color,
      loc === "" ? null : loc,
      nextSortOrder,
    );
    setBusy(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    onCreated();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">New segment</h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder="e.g. Store roles"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Color
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              {["slate", "violet", "amber", "blue", "rose", "emerald"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Location scope
            <select
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All locations in view</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => submit()}
            className={`${PRIMARY_ORANGE_CTA} px-4 py-2 text-sm`}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function AddGroupModal({
  segmentId,
  canManage,
  onClose,
  onCreated,
}: {
  segmentId: string;
  canManage: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!canManage) return;
    setBusy(true);
    const r = await createSmartGroup(segmentId, name);
    setBusy(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    onCreated();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New group</h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-4 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          placeholder="Group name"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => submit()}
            className={`${PRIMARY_ORANGE_CTA} px-4 py-2 text-sm`}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function MembersModal({
  group,
  employees,
  canManage,
  onClose,
  onChange,
}: {
  group: SmartGroupsPayload["segments"][0]["groups"][0];
  employees: SmartGroupsPayload["employeesForPickers"];
  canManage: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const memberSet = new Set(group.memberIds);

  const toggle = async (employeeId: string, next: boolean) => {
    if (!canManage) return;
    setBusy(true);
    const r = await setSmartGroupMember(group.id, employeeId, next);
    setBusy(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    onChange();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="font-semibold text-slate-900">Members — {group.name}</h2>
            <p className="text-xs text-slate-500">
              {group.memberCount} in group · {group.eligibleCount} eligible in scope
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100 px-2 py-2 text-sm">
          {employees.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-2 py-2">
              <input
                type="checkbox"
                checked={memberSet.has(e.id)}
                disabled={!canManage || busy}
                onChange={(ev) => toggle(e.id, ev.target.checked)}
              />
              <span className="flex-1">{e.displayName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AdminsModal({
  group,
  employees,
  canManage,
  onClose,
  onChange,
}: {
  group: SmartGroupsPayload["segments"][0]["groups"][0];
  employees: SmartGroupsPayload["employeesForPickers"];
  canManage: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const adminSet = new Set(group.adminIds);

  const toggle = async (employeeId: string, next: boolean) => {
    if (!canManage) return;
    setBusy(true);
    const r = await setSmartGroupAdmin(group.id, employeeId, next);
    setBusy(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    onChange();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Administrators — {group.name}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100 px-2 py-2 text-sm">
          {employees.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-2 py-2">
              <input
                type="checkbox"
                checked={adminSet.has(e.id)}
                disabled={!canManage || busy}
                onChange={(ev) => toggle(e.id, ev.target.checked)}
              />
              <span className="flex-1">{e.displayName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const ASSIGNMENTS_POPOVER_W = 380;
/** Max height cap; remaining viewport below (or above) anchor is applied via inline style. */
const ASSIGNMENTS_PANEL_CAP_PX = 320;
const ASSIGNMENTS_VIEWPORT_PAD_PX = 12;
/** Vertical gap between trigger and panel (smaller = panel sits higher). */
const ASSIGNMENTS_ANCHOR_GAP_PX = 4;

function AssignmentsDropdown({
  group,
  anchor,
  timeClocks,
  locations,
  canManage,
  onClose,
  onChange,
}: {
  group: SmartGroupsPayload["segments"][0]["groups"][0];
  anchor: DOMRect;
  timeClocks: SmartGroupsPayload["timeClocks"];
  locations: SmartGroupsPayload["locations"];
  canManage: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const clockParentRef = useRef<HTMLInputElement>(null);
  const schedParentRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [expandClocks, setExpandClocks] = useState(true);
  const [expandSched, setExpandSched] = useState(true);

  const clockSet = new Set(
    group.assignments.filter((a) => a.type === "time_clock" && a.timeClockId).map((a) => a.timeClockId!),
  );
  const schedSet = new Set(
    group.assignments.filter((a) => a.type === "schedule" && a.locationId).map((a) => a.locationId!),
  );

  const q = search.trim().toLowerCase();
  const clocksFiltered = useMemo(
    () =>
      timeClocks.filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.locationName.toLowerCase().includes(q),
      ),
    [timeClocks, q],
  );
  const locsFiltered = useMemo(
    () => locations.filter((l) => !q || l.name.toLowerCase().includes(q)),
    [locations, q],
  );

  const clockSel = clocksFiltered.filter((c) => clockSet.has(c.id)).length;
  const clockTot = clocksFiltered.length;
  const schedSel = locsFiltered.filter((l) => schedSet.has(l.id)).length;
  const schedTot = locsFiltered.length;

  useEffect(() => {
    const el = clockParentRef.current;
    if (!el) return;
    el.indeterminate = clockSel > 0 && clockSel < clockTot;
  }, [clockSel, clockTot]);

  useEffect(() => {
    const el = schedParentRef.current;
    if (!el) return;
    el.indeterminate = schedSel > 0 && schedSel < schedTot;
  }, [schedSel, schedTot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const onResize = () => onClose();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [onClose]);

  const toggleClock = async (clockId: string, on: boolean) => {
    if (!canManage) return;
    setBusy(true);
    const r = await setTimeClockAssignment(group.id, clockId, on);
    setBusy(false);
    if (!r.ok) alert(r.error);
    else onChange();
  };

  const toggleSched = async (locationId: string, on: boolean) => {
    if (!canManage) return;
    setBusy(true);
    const r = await setScheduleAssignment(group.id, locationId, on);
    setBusy(false);
    if (!r.ok) alert(r.error);
    else onChange();
  };

  const selectAllVisible = async () => {
    if (!canManage) return;
    setBusy(true);
    try {
      const clockOff = clocksFiltered.filter((c) => !clockSet.has(c.id));
      const locOff = locsFiltered.filter((l) => !schedSet.has(l.id));
      const results = await Promise.all([
        ...clockOff.map((c) => setTimeClockAssignment(group.id, c.id, true)),
        ...locOff.map((l) => setScheduleAssignment(group.id, l.id, true)),
      ]);
      const bad = results.find((r) => !r.ok);
      if (bad) alert(bad.error ?? "Could not update assignments.");
      else onChange();
    } finally {
      setBusy(false);
    }
  };

  const deselectAllVisible = async () => {
    if (!canManage) return;
    setBusy(true);
    try {
      const clockOn = clocksFiltered.filter((c) => clockSet.has(c.id));
      const locOn = locsFiltered.filter((l) => schedSet.has(l.id));
      const results = await Promise.all([
        ...clockOn.map((c) => setTimeClockAssignment(group.id, c.id, false)),
        ...locOn.map((l) => setScheduleAssignment(group.id, l.id, false)),
      ]);
      const bad = results.find((r) => !r.ok);
      if (bad) alert(bad.error ?? "Could not update assignments.");
      else onChange();
    } finally {
      setBusy(false);
    }
  };

  const toggleAllClocksVisible = async () => {
    if (!canManage || clockTot === 0) return;
    setBusy(true);
    try {
      const turnOn = clockSel < clockTot;
      const targets = turnOn
        ? clocksFiltered.filter((c) => !clockSet.has(c.id))
        : clocksFiltered.filter((c) => clockSet.has(c.id));
      const results = await Promise.all(
        targets.map((c) => setTimeClockAssignment(group.id, c.id, turnOn)),
      );
      const bad = results.find((r) => !r.ok);
      if (bad) alert(bad.error ?? "Could not update assignments.");
      else onChange();
    } finally {
      setBusy(false);
    }
  };

  const toggleAllSchedVisible = async () => {
    if (!canManage || schedTot === 0) return;
    setBusy(true);
    try {
      const turnOn = schedSel < schedTot;
      const targets = turnOn
        ? locsFiltered.filter((l) => !schedSet.has(l.id))
        : locsFiltered.filter((l) => schedSet.has(l.id));
      const results = await Promise.all(
        targets.map((l) => setScheduleAssignment(group.id, l.id, turnOn)),
      );
      const bad = results.find((r) => !r.ok);
      if (bad) alert(bad.error ?? "Could not update assignments.");
      else onChange();
    } finally {
      setBusy(false);
    }
  };

  const left = Math.min(
    Math.max(8, anchor.left + anchor.width / 2 - ASSIGNMENTS_POPOVER_W / 2),
    typeof window !== "undefined" ? window.innerWidth - ASSIGNMENTS_POPOVER_W - 8 : 8,
  );

  const innerH = typeof window !== "undefined" ? window.innerHeight : 900;
  let top = anchor.bottom + ASSIGNMENTS_ANCHOR_GAP_PX;
  let maxHeightPx = Math.min(
    ASSIGNMENTS_PANEL_CAP_PX,
    innerH - top - ASSIGNMENTS_VIEWPORT_PAD_PX,
  );
  if (maxHeightPx < 176) {
    const altTop = Math.max(
      ASSIGNMENTS_VIEWPORT_PAD_PX,
      anchor.top - ASSIGNMENTS_PANEL_CAP_PX - ASSIGNMENTS_ANCHOR_GAP_PX,
    );
    const altMax = Math.min(
      ASSIGNMENTS_PANEL_CAP_PX,
      anchor.top - altTop - ASSIGNMENTS_VIEWPORT_PAD_PX,
    );
    if (altMax > maxHeightPx) {
      top = altTop;
      maxHeightPx = altMax;
    }
  }
  maxHeightPx = Math.max(140, maxHeightPx);

  return (
    <>
      <div
        className="fixed inset-0 z-[45] bg-slate-900/10"
        aria-hidden
        onMouseDown={onClose}
      />
      <div
        ref={panelRef}
        style={{ top, left, width: ASSIGNMENTS_POPOVER_W, maxHeight: maxHeightPx }}
        className="fixed z-50 grid grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignments-dropdown-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
          <h2 id="assignments-dropdown-title" className="text-sm font-semibold text-slate-900">
            Assignments
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 px-3 py-2">
          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full rounded-md border border-slate-200 py-2 pl-3 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
            <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Operations
          </span>
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-[11px] font-medium">
            <button
              type="button"
              disabled={!canManage || busy || (clockTot === 0 && schedTot === 0)}
              onClick={() => selectAllVisible()}
              className="text-orange-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={!canManage || busy || (clockSel === 0 && schedSel === 0)}
              onClick={() => deselectAllVisible()}
              className="text-orange-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
            >
              Deselect all
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-2 pb-3 text-sm [scrollbar-gutter:stable]">
          <div className="mt-1 rounded-md border border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2 px-2 py-2">
              <input
                ref={clockParentRef}
                type="checkbox"
                disabled={!canManage || busy || clockTot === 0}
                checked={clockTot > 0 && clockSel === clockTot}
                onChange={() => toggleAllClocksVisible()}
                className="rounded-sm border-slate-300 text-orange-600"
                aria-label="Toggle all visible time clocks"
              />
              <span className="min-w-0 flex-1 font-medium text-slate-800">Time Clock</span>
              <span className="shrink-0 tabular-nums text-xs text-slate-500">
                {clockTot === 0 ? "0/0" : `${clockSel}/${clockTot}`}
              </span>
              <button
                type="button"
                className="rounded-md p-1 text-slate-500 hover:bg-white"
                aria-expanded={expandClocks}
                onClick={() => setExpandClocks((v) => !v)}
                aria-label={expandClocks ? "Collapse time clocks" : "Expand time clocks"}
              >
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${expandClocks ? "rotate-90" : ""}`}
                />
              </button>
            </div>
            {expandClocks ? (
              <ul className="space-y-0.5 border-t border-slate-100 bg-white px-2 py-2">
                {clocksFiltered.length === 0 ? (
                  <li className="px-2 py-1 text-xs text-slate-500">No clocks match search.</li>
                ) : (
                  clocksFiltered.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 py-1">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded-sm border-slate-300 text-orange-600"
                        checked={clockSet.has(c.id)}
                        disabled={!canManage || busy}
                        onChange={(e) => toggleClock(c.id, e.target.checked)}
                      />
                      <span className="min-w-0 leading-snug text-slate-700">
                        <span className="font-medium">
                          {c.locationName} — {c.name}
                        </span>{" "}
                        <span className="text-slate-400">({c.locationName})</span>
                      </span>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>

          <div className="mt-2 rounded-md border border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2 px-2 py-2">
              <input
                ref={schedParentRef}
                type="checkbox"
                disabled={!canManage || busy || schedTot === 0}
                checked={schedTot > 0 && schedSel === schedTot}
                onChange={() => toggleAllSchedVisible()}
                className="rounded-sm border-slate-300 text-orange-600"
                aria-label="Toggle all visible schedules"
              />
              <span className="min-w-0 flex-1 font-medium text-slate-800">Schedule</span>
              <span className="shrink-0 tabular-nums text-xs text-slate-500">
                {schedTot === 0 ? "0/0" : `${schedSel}/${schedTot}`}
              </span>
              <button
                type="button"
                className="rounded-md p-1 text-slate-500 hover:bg-white"
                aria-expanded={expandSched}
                onClick={() => setExpandSched((v) => !v)}
                aria-label={expandSched ? "Collapse schedules" : "Expand schedules"}
              >
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${expandSched ? "rotate-90" : ""}`}
                />
              </button>
            </div>
            {expandSched ? (
              <ul className="space-y-0.5 border-t border-slate-100 bg-white px-2 py-2">
                {locsFiltered.length === 0 ? (
                  <li className="px-2 py-1 text-xs text-slate-500">No stores match search.</li>
                ) : (
                  locsFiltered.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        className="rounded-sm border-slate-300 text-orange-600"
                        checked={schedSet.has(l.id)}
                        disabled={!canManage || busy}
                        onChange={(e) => toggleSched(l.id, e.target.checked)}
                      />
                      <span className="text-slate-700">{l.name}</span>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
