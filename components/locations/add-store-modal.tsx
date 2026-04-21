"use client";

import { ChevronDown, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
import { createLocation } from "@/app/actions/location-create";
import type { LocationStatus } from "@/app/actions/location-status";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";
import { normalizeRoleLabel } from "@/lib/rbac/matrix";
import { bucketForEmployee, displayFirst, displayLast, type DirectoryEmployee } from "@/lib/users/directory-buckets";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: DirectoryEmployee[];
  canManageStores: boolean;
};

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const defaultHours = {
  mon: { open: "09:00", close: "17:00", closed: false },
  tue: { open: "09:00", close: "17:00", closed: false },
  wed: { open: "09:00", close: "17:00", closed: false },
  thu: { open: "09:00", close: "17:00", closed: false },
  fri: { open: "09:00", close: "17:00", closed: false },
  sat: { open: "10:00", close: "16:00", closed: false },
  sun: { open: "10:00", close: "16:00", closed: true },
};

export function AddStoreModal({ open, onOpenChange, employees, canManageStores }: Props) {
  const router = useRouter();
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<LocationStatus>("running");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("US");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [hoursJson, setHoursJson] = useState(() => JSON.stringify(defaultHours, null, 2));
  const [geoLat, setGeoLat] = useState("");
  const [geoLng, setGeoLng] = useState("");
  const [geoRadius, setGeoRadius] = useState("");
  const [managerId, setManagerId] = useState("");

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setError(null);
      setName("");
      setSlug("");
      setStatus("running");
      setAddress1("");
      setAddress2("");
      setCity("");
      setState("");
      setPostal("");
      setCountry("US");
      setPhone("");
      setTimezone("America/New_York");
      setHoursJson(JSON.stringify(defaultHours, null, 2));
      setGeoLat("");
      setGeoLng("");
      setGeoRadius("");
      setManagerId("");
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!name.trim()) return;
    // Auto-slug only if user hasn't edited it yet.
    if (!slug.trim()) queueMicrotask(() => setSlug(slugify(name)));
  }, [name, open, slug]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const managers = useMemo(() => {
    const active = employees.filter((e) => bucketForEmployee(e) !== "archived");
    return active
      .filter((e) => normalizeRoleLabel(e.role) === "store_manager")
      .map((e) => ({
        id: e.id,
        label: `${displayFirst(e)} ${displayLast(e)}`.replace(/\\s+/g, " ").trim() || e.full_name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employees]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      let hours: Record<string, unknown> = {};
      try {
        hours = JSON.parse(hoursJson);
      } catch {
        setError("Hours must be valid JSON.");
        return;
      }

      const toNum = (v: string) => {
        const t = v.trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      };

      const res = await createLocation({
        name,
        slug,
        status: status === "archived" ? "not_running" : status,
        address_line1: address1,
        address_line2: address2,
        city,
        state,
        postal_code: postal,
        country,
        phone,
        timezone,
        hours,
        geofence_lat: toNum(geoLat),
        geofence_lng: toNum(geoLng),
        geofence_radius_m: toNum(geoRadius) as number | null,
        manager_employee_id: managerId.trim() || null,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
      router.refresh();
    });
  };

  if (!open) return null;

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
        className="my-4 w-full max-w-3xl rounded-2xl border border-slate-200/90 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              Add store
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a store with address, hours, timezone, optional geofence, and store lead.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!canManageStores ? (
          <p className="m-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            You don’t have permission to add stores.
          </p>
        ) : (
          <div className="space-y-4 px-5 py-4">
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Store name
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug.trim()) setSlug(slugify(e.target.value));
                  }}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Slug
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Status
                <div className="relative mt-1.5">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as LocationStatus)}
                    className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  >
                    <option value="running">Running</option>
                    <option value="not_running">Not running</option>
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden
                  />
                </div>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Store lead (optional)
                <div className="relative mt-1.5">
                  <select
                    value={managerId}
                    onChange={(e) => setManagerId(e.target.value)}
                    className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  >
                    <option value="">— None —</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden
                  />
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Address line 1
                <input
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Address line 2
                <input
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                City
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                State
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Postal code
                <input
                  value={postal}
                  onChange={(e) => setPostal(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Country
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Phone
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Timezone
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Store hours (JSON)
              <textarea
                value={hoursJson}
                onChange={(e) => setHoursJson(e.target.value)}
                rows={8}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium text-slate-700">
                Geofence lat (optional)
                <input
                  value={geoLat}
                  onChange={(e) => setGeoLat(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Geofence lng (optional)
                <input
                  value={geoLng}
                  onChange={(e) => setGeoLng(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Radius meters (optional)
                <input
                  value={geoRadius}
                  onChange={(e) => setGeoRadius(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
            </div>
          </div>
        )}

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
            onClick={() => submit()}
            disabled={!canManageStores || pending}
            className={`${PRIMARY_ORANGE_CTA} px-4 py-2.5 text-sm disabled:opacity-50`}
          >
            {pending ? "Saving…" : "Add store"}
          </button>
        </div>
      </div>
    </div>
  );
}

