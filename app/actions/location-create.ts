"use server";

import { revalidatePath } from "next/cache";
import { getRbacContext, hasPermission } from "@/lib/rbac/context";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateLocationPayload = {
  name: string;
  slug: string;
  sort_order?: number | null;
  status: "running" | "not_running";
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  timezone: string;
  hours: Record<string, unknown>;
  geofence_lat: number | null;
  geofence_lng: number | null;
  geofence_radius_m: number | null;
  manager_employee_id: string | null;
};

export type CreateLocationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

async function gate(): Promise<CreateLocationResult | null> {
  if (process.env.RBAC_ENABLED !== "true") return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  if (!hasPermission(ctx, PERMISSIONS.USERS_MANAGE) && !hasPermission(ctx, PERMISSIONS.ORG_OWNER)) {
    return { ok: false, error: "You don’t have permission to add stores." };
  }
  return null;
}

function cleanSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createLocation(payload: CreateLocationPayload): Promise<CreateLocationResult> {
  const g = await gate();
  if (g) return g;

  const name = String(payload.name ?? "").trim();
  if (!name) return { ok: false, error: "Store name is required." };

  const slug = cleanSlug(String(payload.slug ?? ""));
  if (!slug) return { ok: false, error: "Store slug is required." };

  const timezone = String(payload.timezone ?? "").trim();
  if (!timezone) return { ok: false, error: "Timezone is required." };

  const address1 = String(payload.address_line1 ?? "").trim();
  const city = String(payload.city ?? "").trim();
  const state = String(payload.state ?? "").trim();
  const postal = String(payload.postal_code ?? "").trim();
  const country = String(payload.country ?? "").trim();
  if (!address1 || !city || !state || !postal || !country) {
    return { ok: false, error: "Address fields are required (line 1, city, state, postal code, country)." };
  }

  const hours = payload.hours ?? {};
  if (typeof hours !== "object" || hours == null) {
    return { ok: false, error: "Hours must be provided." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("locations")
    .insert({
      name,
      slug,
      sort_order: payload.sort_order ?? 0,
      status: payload.status ?? "running",
      address_line1: address1,
      address_line2: String(payload.address_line2 ?? "").trim() || null,
      city,
      state,
      postal_code: postal,
      country,
      phone: String(payload.phone ?? "").trim() || null,
      timezone,
      hours,
      geofence_lat: payload.geofence_lat ?? null,
      geofence_lng: payload.geofence_lng ?? null,
      geofence_radius_m: payload.geofence_radius_m ?? null,
      manager_employee_id: payload.manager_employee_id ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/locations");
  return { ok: true, id: String((data as { id?: string }).id ?? "") };
}

