"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  initialError?: string | null;
  /** Return URL after sign-in (from server `next` search param). */
  nextPath?: string;
};

/**
 * Shown only in `next dev` — create this user once in Supabase → Authentication → Users.
 * With `RBAC_ENABLED=true`, run `scripts/bootstrap-dev-org-owner.sql` (or equivalent) so
 * `employees.email` matches this address and `role` is Org Owner.
 */
const DEV_LOGIN_EMAIL = "dev@retailhr.local";
const DEV_LOGIN_PASSWORD = "DevPassword123!";

export function LoginForm({ initialError, nextPath }: Props) {
  const searchParams = useSearchParams();
  const isDev = process.env.NODE_ENV === "development";
  const [email, setEmail] = useState(() => (isDev ? DEV_LOGIN_EMAIL : ""));
  const [password, setPassword] = useState(() => (isDev ? DEV_LOGIN_PASSWORD : ""));
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    /**
     * Hard navigation, not router.push(). Two reasons:
     * 1. router.refresh() + router.push() from the /login route raced with
     *    the middleware's `/login → /` redirect (the auth cookie was set
     *    by signInWithPassword), which is why a second click was needed
     *    to actually transition.
     * 2. We want the dashboard shell to mount with a fresh RSC tree under
     *    the new auth identity — a hard nav guarantees one clean middleware
     *    pass with the cookie present, no stale client cache.
     */
    const dest = safeNextPath(nextPath ?? searchParams.get("next"));
    window.location.assign(dest);
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Retail HR — sign in with your work account.
        </p>
      </div>

      {isDev ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/90 px-3 py-3 text-xs text-orange-950">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-800">
            Preview sign-in
          </p>
          <p className="mt-1 text-[13px] font-semibold text-orange-950">Use these credentials</p>
          <p className="mt-1 text-[11px] text-orange-900/90">
            Add this example account in your sign-in users list if it doesn’t exist yet.
          </p>
          <div className="mt-2 space-y-2">
            <div className="rounded-lg border border-orange-200/80 bg-white px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-800">Email</div>
              <div className="mt-0.5 select-all font-mono text-[13px] font-medium text-slate-900">
                {DEV_LOGIN_EMAIL}
              </div>
            </div>
            <div className="rounded-lg border border-orange-200/80 bg-white px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-800">Password</div>
              <div className="mt-0.5 select-all font-mono text-[13px] font-medium text-slate-900">
                {DEV_LOGIN_PASSWORD}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-orange-900/90">
            If access controls are enabled, make sure this email is set up as a{" "}
            <strong>Company owner</strong> in the employee directory so you can access all admin features.
          </p>
          <p className="mt-1 text-[11px] text-orange-800/90">
            Hide this panel in production.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-600">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-600">
            Password
          </label>
          <input
            id="password"
            name="password"
            type={isDev ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
          />
        </div>
        <p className="text-right">
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-orange-700 underline-offset-2 hover:underline"
          >
            Forgot password?
          </Link>
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
