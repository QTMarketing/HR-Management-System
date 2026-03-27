/**
 * When false (default): middleware does not require login; `/login` redirects to `/`.
 * Set `NEXT_PUBLIC_AUTH_ENABLED=true` in `.env.local` when you re-enable Supabase login + RLS.
 */
export const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
