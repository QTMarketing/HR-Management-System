/**
 * When false (default): middleware refreshes the session but does not require login; `/login` redirects to `/`.
 * When true: unauthenticated users are redirected to `/login` (see `lib/supabase/middleware.ts`, wired from root `proxy.ts`).
 */
export const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
