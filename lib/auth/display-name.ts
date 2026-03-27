import type { User } from "@supabase/supabase-js";

/** First name or email local-part for dashboard greeting. */
export function displayNameFromUser(user: User | null): string {
  if (!user) return "there";
  const meta = user.user_metadata as { full_name?: string } | undefined;
  if (meta?.full_name?.trim()) {
    const first = meta.full_name.trim().split(/\s+/)[0];
    return first ?? meta.full_name;
  }
  const local = user.email?.split("@")[0];
  if (local) {
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "there";
}
