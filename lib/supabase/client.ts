"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for **browser** (Client Components). Uses the project HTTPS URL +
 * anon key — PostgREST, Auth, Storage, Realtime over HTTPS.
 *
 * For server-side SQL, keep using Drizzle + `DATABASE_URL` (Postgres wire protocol).
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.",
    );
  }
  return createBrowserClient(url, key);
}
