"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDev = process.env.NODE_ENV === "development";
  const [email, setEmail] = useState(() => (isDev ? DEV_LOGIN_EMAIL : ""));
  const [password, setPassword] = useState(() => (isDev ? DEV_LOGIN_PASSWORD : ""));
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    const dest = safeNextPath(
      nextPath ?? searchParams.get("next"),
    );
    router.refresh();
    router.push(dest);
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Retail HR — use your Supabase Auth user.
        </p>
      </div>

      {isDev ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/90 px-3 py-3 text-xs text-orange-950">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-800">
            Development — demo sign-in
          </p>
          <p className="mt-1 text-[13px] font-semibold text-orange-950">Use these credentials</p>
          <p className="mt-1 text-[11px] text-orange-900/90">
            Supabase → <strong>Authentication</strong> → <strong>Users</strong>: add user with this email
            &amp; password if missing.
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
            With <span className="font-mono">RBAC_ENABLED=true</span>, run{" "}
            <span className="font-mono">scripts/bootstrap-dev-org-owner.sql</span> in the Supabase SQL
            editor so this email is an <strong>Org Owner</strong> in <span className="font-mono">employees</span>.
          </p>
          <p className="mt-1 text-[11px] text-orange-800/90">
            Remove this panel before production builds.
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
