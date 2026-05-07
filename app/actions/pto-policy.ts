"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRbacContext } from "@/lib/rbac/context";

export type PtoBucket = "vacation" | "sick";
export type PtoCohort = "employee" | "manager" | "all";

export type PtoEntitlementTier = {
  bucket: PtoBucket;
  cohort: PtoCohort;
  minYearsOfService: number;
  annualHours: number;
};

export type PtoPolicyWorkDays = {
  sun: boolean;
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
};

export type PtoPolicySummary = {
  id: string;
  name: string;
  timezone: string;
  standardDayHours: number;
  workDays: PtoPolicyWorkDays;
  vacation: {
    maxAccrualHours: number | null;
    minRequestHours: number | null;
    maxRequestHours: number | null;
    cashoutEnabled: boolean;
    cashoutDay: number;
    cashoutMinBalanceHours: number;
    januaryPayoutWindowDays: number;
  };
  sick: {
    maxAccrualHours: number | null;
    minRequestHours: number | null;
    maxRequestHours: number | null;
  };
  vacationTiers: PtoEntitlementTier[];
  sickTiers: PtoEntitlementTier[];
};

type Result =
  | { ok: true; policy: PtoPolicySummary | null }
  | { ok: false; error: string };

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const POLICY_SELECT = [
  "id",
  "name",
  "timezone",
  "standard_day_hours",
  "work_day_sun",
  "work_day_mon",
  "work_day_tue",
  "work_day_wed",
  "work_day_thu",
  "work_day_fri",
  "work_day_sat",
  "vacation_max_accrual_hours",
  "vacation_cashout_enabled",
  "vacation_cashout_day",
  "vacation_cashout_min_balance_hours",
  "january_payout_window_days",
  "vacation_min_request_hours",
  "vacation_max_request_hours",
  "sick_max_accrual_hours",
  "sick_min_request_hours",
  "sick_max_request_hours",
].join(", ");

type PolicyRow = {
  id: string;
  name?: string | null;
  timezone?: string | null;
  standard_day_hours?: number | string | null;
  work_day_sun?: boolean | null;
  work_day_mon?: boolean | null;
  work_day_tue?: boolean | null;
  work_day_wed?: boolean | null;
  work_day_thu?: boolean | null;
  work_day_fri?: boolean | null;
  work_day_sat?: boolean | null;
  vacation_max_accrual_hours?: number | string | null;
  vacation_cashout_enabled?: boolean | null;
  vacation_cashout_day?: number | string | null;
  vacation_cashout_min_balance_hours?: number | string | null;
  january_payout_window_days?: number | string | null;
  vacation_min_request_hours?: number | string | null;
  vacation_max_request_hours?: number | string | null;
  sick_max_accrual_hours?: number | string | null;
  sick_min_request_hours?: number | string | null;
  sick_max_request_hours?: number | string | null;
};

function mapPolicyRow(row: PolicyRow, tiers: PtoEntitlementTier[]): PtoPolicySummary {
  const tierFor = (b: PtoBucket) => tiers.filter((t) => t.bucket === b);
  return {
    id: String(row.id),
    name: String(row.name ?? "Default PTO policy"),
    timezone: String(row.timezone ?? "UTC"),
    standardDayHours: toNum(row.standard_day_hours, 8),
    workDays: {
      sun: Boolean(row.work_day_sun),
      mon: Boolean(row.work_day_mon ?? true),
      tue: Boolean(row.work_day_tue ?? true),
      wed: Boolean(row.work_day_wed ?? true),
      thu: Boolean(row.work_day_thu ?? true),
      fri: Boolean(row.work_day_fri ?? true),
      sat: Boolean(row.work_day_sat),
    },
    vacation: {
      maxAccrualHours: toNumOrNull(row.vacation_max_accrual_hours),
      minRequestHours: toNumOrNull(row.vacation_min_request_hours),
      maxRequestHours: toNumOrNull(row.vacation_max_request_hours),
      cashoutEnabled: Boolean(row.vacation_cashout_enabled),
      cashoutDay: toNum(row.vacation_cashout_day, 1),
      cashoutMinBalanceHours: toNum(row.vacation_cashout_min_balance_hours, 0),
      januaryPayoutWindowDays: toNum(row.january_payout_window_days, 31),
    },
    sick: {
      maxAccrualHours: toNumOrNull(row.sick_max_accrual_hours),
      minRequestHours: toNumOrNull(row.sick_min_request_hours),
      maxRequestHours: toNumOrNull(row.sick_max_request_hours),
    },
    vacationTiers: tierFor("vacation"),
    sickTiers: tierFor("sick"),
  };
}

export async function getPtoPolicySummary(): Promise<Result> {
  const supabase = await createSupabaseServerClient();

  const { data: polRow, error: polErr } = await supabase
    .from("pto_policies")
    .select(POLICY_SELECT)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (polErr) return { ok: false, error: polErr.message };
  if (!polRow) return { ok: true, policy: null };

  const polRowTyped = polRow as unknown as PolicyRow;
  const policyId = String(polRowTyped.id);

  const { data: tierRows, error: tierErr } = await supabase
    .from("pto_entitlement_tiers")
    .select("bucket, cohort, min_years_of_service, annual_hours")
    .eq("policy_id", policyId)
    .order("bucket", { ascending: true })
    .order("cohort", { ascending: true })
    .order("min_years_of_service", { ascending: true });

  if (tierErr) return { ok: false, error: tierErr.message };

  const tiers: PtoEntitlementTier[] = (tierRows ?? []).map((r) => ({
    bucket: (r.bucket === "sick" ? "sick" : "vacation") as PtoBucket,
    cohort: ((r.cohort === "manager" || r.cohort === "all"
      ? r.cohort
      : "employee") as PtoCohort),
    minYearsOfService: toNum(r.min_years_of_service, 0),
    annualHours: toNum(r.annual_hours, 0),
  }));

  return {
    ok: true,
    policy: mapPolicyRow(polRowTyped, tiers),
  };
}

// ---------- Update actions (Owner-only) -------------------------------------

export type PtoPolicyUpdateInput = {
  policyId: string;
  name: string;
  standardDayHours: number;
  workDays: PtoPolicyWorkDays;
  vacation: {
    maxAccrualHours: number | null;
    minRequestHours: number | null;
    maxRequestHours: number | null;
    cashoutEnabled: boolean;
    cashoutDay: number;
    cashoutMinBalanceHours: number;
    januaryPayoutWindowDays: number;
  };
  sick: {
    maxAccrualHours: number | null;
    minRequestHours: number | null;
    maxRequestHours: number | null;
  };
};

type UpdateResult = { ok: true } | { ok: false; error: string };

async function ensureOwner(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getRbacContext(supabase, user);
  // When RBAC is disabled (legacy dev), allow through. Otherwise require Owner.
  if (!ctx.enabled) return { ok: true };
  if (ctx.roleKey !== "owner") {
    return { ok: false, error: "Only Company Owners can edit PTO policy." };
  }
  return { ok: true };
}

function sanitizeOptionalHours(v: number | null): number | null {
  if (v == null) return null;
  if (!Number.isFinite(v)) return null;
  if (v <= 0) return null;
  return Math.round(v * 100) / 100;
}

function validateUpdateInput(
  input: PtoPolicyUpdateInput,
): { ok: true } | { ok: false; error: string } {
  if (!input.policyId || typeof input.policyId !== "string") {
    return { ok: false, error: "Missing policy id." };
  }
  if (!input.name?.trim()) {
    return { ok: false, error: "Policy name is required." };
  }
  if (!Number.isFinite(input.standardDayHours) || input.standardDayHours <= 0) {
    return { ok: false, error: "Standard day hours must be greater than zero." };
  }
  const wd = input.workDays;
  const anyWorkDay = wd.sun || wd.mon || wd.tue || wd.wed || wd.thu || wd.fri || wd.sat;
  if (!anyWorkDay) {
    return { ok: false, error: "Pick at least one work day." };
  }
  for (const bucket of ["vacation", "sick"] as const) {
    const r = input[bucket];
    if (
      r.minRequestHours != null &&
      r.maxRequestHours != null &&
      r.minRequestHours > r.maxRequestHours
    ) {
      const label = bucket === "vacation" ? "Vacation" : "Sick";
      return {
        ok: false,
        error: `${label}: minimum request length cannot be greater than maximum.`,
      };
    }
  }
  if (
    !Number.isInteger(input.vacation.cashoutDay) ||
    input.vacation.cashoutDay < 1 ||
    input.vacation.cashoutDay > 28
  ) {
    return { ok: false, error: "Cash-out day must be between 1 and 28." };
  }
  if (
    !Number.isFinite(input.vacation.cashoutMinBalanceHours) ||
    input.vacation.cashoutMinBalanceHours < 0
  ) {
    return { ok: false, error: "Cash-out minimum balance cannot be negative." };
  }
  if (
    !Number.isInteger(input.vacation.januaryPayoutWindowDays) ||
    input.vacation.januaryPayoutWindowDays < 1 ||
    input.vacation.januaryPayoutWindowDays > 31
  ) {
    return {
      ok: false,
      error: "January payout window must be between 1 and 31 days.",
    };
  }
  return { ok: true };
}

export async function updatePtoPolicySettings(
  input: PtoPolicyUpdateInput,
): Promise<UpdateResult> {
  const owner = await ensureOwner();
  if (!owner.ok) return owner;

  const v = validateUpdateInput(input);
  if (!v.ok) return v;

  const supabase = await createSupabaseServerClient();

  const patch = {
    name: input.name.trim(),
    standard_day_hours: input.standardDayHours,
    work_day_sun: input.workDays.sun,
    work_day_mon: input.workDays.mon,
    work_day_tue: input.workDays.tue,
    work_day_wed: input.workDays.wed,
    work_day_thu: input.workDays.thu,
    work_day_fri: input.workDays.fri,
    work_day_sat: input.workDays.sat,
    vacation_max_accrual_hours: sanitizeOptionalHours(input.vacation.maxAccrualHours),
    vacation_min_request_hours: sanitizeOptionalHours(input.vacation.minRequestHours),
    vacation_max_request_hours: sanitizeOptionalHours(input.vacation.maxRequestHours),
    vacation_cashout_enabled: input.vacation.cashoutEnabled,
    vacation_cashout_day: input.vacation.cashoutDay,
    vacation_cashout_min_balance_hours: Math.max(0, input.vacation.cashoutMinBalanceHours),
    january_payout_window_days: input.vacation.januaryPayoutWindowDays,
    sick_max_accrual_hours: sanitizeOptionalHours(input.sick.maxAccrualHours),
    sick_min_request_hours: sanitizeOptionalHours(input.sick.minRequestHours),
    sick_max_request_hours: sanitizeOptionalHours(input.sick.maxRequestHours),
  };

  const { data: updated, error } = await supabase
    .from("pto_policies")
    .update(patch)
    .eq("id", input.policyId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error:
        "Policy was not saved. Either the database row no longer exists or your account does not have permission to edit time off policies.",
    };
  }

  revalidatePath("/time-off");
  return { ok: true };
}

export type ReplaceTiersInput = {
  policyId: string;
  bucket: PtoBucket;
  tiers: Array<Pick<PtoEntitlementTier, "cohort" | "minYearsOfService" | "annualHours">>;
};

export async function replaceEntitlementTiers(
  input: ReplaceTiersInput,
): Promise<UpdateResult> {
  const owner = await ensureOwner();
  if (!owner.ok) return owner;

  if (!input.policyId) return { ok: false, error: "Missing policy id." };
  if (input.bucket !== "vacation" && input.bucket !== "sick") {
    return { ok: false, error: "Invalid bucket." };
  }

  // Validate / dedupe tier rows.
  const seen = new Set<string>();
  const cleanRows: Array<{
    policy_id: string;
    bucket: PtoBucket;
    cohort: PtoCohort;
    min_years_of_service: number;
    annual_hours: number;
  }> = [];

  for (const t of input.tiers) {
    const cohort: PtoCohort =
      t.cohort === "manager" || t.cohort === "all" ? t.cohort : "employee";
    const minY = Math.max(0, Math.floor(Number(t.minYearsOfService) || 0));
    const annual = Math.max(0, Number(t.annualHours) || 0);
    if (annual <= 0) continue; // skip empty rows
    const key = `${cohort}::${minY}`;
    if (seen.has(key)) {
      return {
        ok: false,
        error: `Duplicate tier row for cohort "${cohort}" at ${minY} years.`,
      };
    }
    seen.add(key);
    cleanRows.push({
      policy_id: input.policyId,
      bucket: input.bucket,
      cohort,
      min_years_of_service: minY,
      annual_hours: Math.round(annual * 100) / 100,
    });
  }

  const supabase = await createSupabaseServerClient();

  // Replace strategy: delete existing rows for (policy, bucket), then insert clean rows.
  // We don't strictly require any rows to be deleted (there may have been none),
  // but if we have rows to insert and the insert returns nothing, that's a hint
  // the write was blocked.
  const { error: delErr } = await supabase
    .from("pto_entitlement_tiers")
    .delete()
    .eq("policy_id", input.policyId)
    .eq("bucket", input.bucket);
  if (delErr) return { ok: false, error: delErr.message };

  if (cleanRows.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from("pto_entitlement_tiers")
      .insert(cleanRows)
      .select("id");
    if (insErr) return { ok: false, error: insErr.message };
    if (!inserted || inserted.length === 0) {
      return {
        ok: false,
        error:
          "Time off tiers were not saved. Your account may not have permission to edit time off policies.",
      };
    }
  }

  revalidatePath("/time-off");
  return { ok: true };
}
