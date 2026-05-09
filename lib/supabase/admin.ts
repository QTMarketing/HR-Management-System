import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-only operations (e.g. invite-by-email).
 * Returns `null` when `SUPABASE_SERVICE_ROLE_KEY` is missing so dev installs
 * without secrets still run; callers should degrade gracefully.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
