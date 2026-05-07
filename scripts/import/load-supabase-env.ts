/**
 * Local import scripts run with `npx tsx` and do not load Next.js env automatically.
 * Loads `.env.local` then `.env` from the repo root and resolves URL/key used by those scripts.
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export function loadRepoEnvFiles(): void {
  dotenv.config({ path: path.join(repoRoot, ".env.local") });
  dotenv.config({ path: path.join(repoRoot, ".env") });
}

export function getSupabaseScriptEnv(): { url: string; serviceKey: string } {
  loadRepoEnvFiles();
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase credentials. Add to .env.local: SUPABASE_SERVICE_ROLE_KEY (Settings → API → service_role; never commit). " +
        "URL: set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL (same project URL you use for the app).",
    );
  }
  return { url, serviceKey };
}
