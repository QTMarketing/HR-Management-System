"use client";

import { approveTimeOffRequest, denyTimeOffRequest } from "@/app/actions/time-off-record";
import type { PendingTimeOffRequestRow } from "@/lib/time-clock/pending-time-off";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type Props = {
  locationId: string;
  requests: PendingTimeOffRequestRow[];
};

export function PendingTimeOffQueue({ locationId, requests }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [denyId, setDenyId] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState("");

  if (requests.length === 0) return null;

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 shadow-sm">
      <h3 className="text-sm font-semibold text-sky-950">Pending time off requests</h3>
      <p className="mt-0.5 text-xs text-sky-900/80">
        Submitted by employees at this store. Approve or deny — team members are notified via the time
        clock after refresh.
      </p>
      {err ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {err}
        </p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {requests.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-sky-200/80 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <div className="font-medium text-slate-900">{r.employeeName}</div>
            <div className="text-xs text-slate-600">
              {r.timeOffType} · {fmt(r.startAt)} → {fmt(r.endAt)}
            </div>
            {r.employeeNotes ? (
              <div className="mt-1 text-xs italic text-slate-600">&ldquo;{r.employeeNotes}&rdquo;</div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  startTransition(async () => {
                    const res = await approveTimeOffRequest(r.id, locationId);
                    if (!res.ok) {
                      setErr(res.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  setDenyId(r.id);
                  setDenyNote("");
                }}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
            {denyId === r.id ? (
              <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-2">
                <input
                  type="text"
                  placeholder="Optional reason (shown on record)"
                  value={denyNote}
                  onChange={(e) => setDenyNote(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-slate-600 underline"
                    onClick={() => setDenyId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => {
                      setErr(null);
                      startTransition(async () => {
                        const res = await denyTimeOffRequest(r.id, locationId, denyNote);
                        if (!res.ok) {
                          setErr(res.error);
                          return;
                        }
                        setDenyId(null);
                        router.refresh();
                      });
                    }}
                  >
                    Confirm deny
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
