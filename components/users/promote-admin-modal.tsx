"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { promoteEmployeeToAdmin } from "@/app/actions/users-directory";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";
import {
  type DirectoryEmployee,
  bucketForEmployee,
  displayFirst,
  displayLast,
} from "@/lib/users/directory-buckets";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: DirectoryEmployee[];
};

/** Users tab only — excludes people already treated as admins. */
export function usersTabPromoteCandidates(employees: DirectoryEmployee[]): DirectoryEmployee[] {
  return employees.filter((e) => bucketForEmployee(e) === "users" && e.status === "active");
}

export function PromoteAdminModal({ open, onOpenChange, candidates }: Props) {
  const titleId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setError(null);
      setSelectedId("");
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const submit = async () => {
    setError(null);
    if (!selectedId) {
      setError("Choose a user to promote.");
      return;
    }
    startTransition(async () => {
      const r = await promoteEmployeeToAdmin(selectedId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      close();
      router.refresh();
    });
  };

  if (!open) return null;

  const sorted = [...candidates].sort((a, b) =>
    `${displayFirst(a)} ${displayLast(a)}`.localeCompare(`${displayFirst(b)} ${displayLast(b)}`),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-4 backdrop-blur-[2px] sm:items-center sm:p-8"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-4 w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            Promote existing user
          </h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-slate-600">
            Turn a user in the <strong>Users</strong> tab into a Store Manager. They will appear
            under <strong>Admins</strong> with default access labels.
          </p>

          {sorted.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              No eligible users in this location scope. Add people on the Users tab first, or widen
              the location filter.
            </p>
          ) : (
            <label className="block text-sm font-medium text-slate-700">
              User
              <select
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">Select user…</option>
                {sorted.map((e) => (
                  <option key={e.id} value={e.id}>
                    {`${displayFirst(e)} ${displayLast(e)}`.replace(/\s+/g, " ").trim() ||
                      e.full_name}
                    {e.email ? ` (${e.email})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || sorted.length === 0 || !selectedId}
            onClick={() => submit()}
            className={`${PRIMARY_ORANGE_CTA} px-4 py-2.5 text-sm disabled:opacity-50`}
          >
            {pending ? "Promoting…" : "Promote to admin"}
          </button>
        </div>
      </div>
    </div>
  );
}
