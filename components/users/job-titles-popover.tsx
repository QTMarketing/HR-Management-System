"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createJobTitle,
  listJobTitles,
  setEmployeeJobTitles,
  type JobTitleRow,
} from "@/app/actions/job-titles";
import type { EmployeeJobTitle } from "@/lib/users/directory-buckets";

type Props = {
  employeeId: string;
  primary: EmployeeJobTitle | null;
  secondary: EmployeeJobTitle | null;
  canEdit: boolean;
  /** Which cell is rendering this control */
  mode: "primary" | "secondary";
};

export function JobTitlesPopover({ employeeId, primary, secondary, canEdit, mode }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<JobTitleRow[]>([]);
  const [draftPrimary, setDraftPrimary] = useState<string>(primary?.id ?? "");
  const [draftSecondary, setDraftSecondary] = useState<string>(secondary?.id ?? "");
  const [newTitle, setNewTitle] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setError(null);
      setDraftPrimary(primary?.id ?? "");
      setDraftSecondary(secondary?.id ?? "");
      setNewTitle("");
    });
  }, [open, primary?.id, secondary?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const res = await listJobTitles();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitles(res.data);
    });
  }, [open]);

  const display = useMemo(() => {
    if (mode === "primary") return primary?.name ?? "—";
    return secondary?.name ?? "—";
  }, [mode, primary?.name, secondary?.name]);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await setEmployeeJobTitles(employeeId, {
        primaryJobTitleId: draftPrimary || null,
        secondaryJobTitleId: draftSecondary || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const addNew = () => {
    setError(null);
    const cleaned = newTitle.trim();
    if (!cleaned) return;
    startTransition(async () => {
      const res = await createJobTitle(cleaned);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitles((prev) => {
        const next = [...prev];
        if (!next.some((t) => t.id === res.data.id)) next.push(res.data);
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setNewTitle("");
    });
  };

  const btnClass =
    "inline-flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        disabled={!canEdit}
        className={btnClass}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={canEdit ? "Edit job titles" : "Job titles are editable for admins/owners only"}
      >
        <span className="truncate">{display}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-800">Job titles</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Position = primary. Title = secondary (optional).
              </p>
            </div>

            <label className="block text-xs font-medium text-slate-700">
              Position (primary)
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                value={draftPrimary}
                onChange={(e) => setDraftPrimary(e.target.value)}
              >
                <option value="">—</option>
                {titles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-700">
              Title (secondary)
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                value={draftSecondary}
                onChange={(e) => setDraftSecondary(e.target.value)}
              >
                <option value="">—</option>
                {titles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Create a new job title
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Barista"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  type="button"
                  onClick={() => addNew()}
                  disabled={pending || !newTitle.trim()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                  title="Add job title"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                onClick={() => save()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

