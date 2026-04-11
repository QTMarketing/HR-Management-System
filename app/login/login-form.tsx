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

/** Shown only in `next dev` — create this user once in Supabase → Authentication → Users. */
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
        <div className="rounded-lg border border-orange-200 bg-orange-50/90 px-3 py-2.5 text-xs text-orange-950">
          <p className="font-semibold text-orange-900">Development login</p>
          <p className="mt-1 text-orange-900/90">
            In Supabase Dashboard → <strong>Authentication</strong> → <strong>Users</strong> →{" "}
            <strong>Add user</strong>, create:
          </p>
          <dl className="mt-2 space-y-1 font-mono text-[11px] text-orange-950">
            <div className="flex justify-between gap-2">
              <dt className="text-orange-800">Email</dt>
              <dd className="break-all text-right">{DEV_LOGIN_EMAIL}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-orange-800">Password</dt>
              <dd className="break-all text-right">{DEV_LOGIN_PASSWORD}</dd>
            </div>
          </dl>
          <p className="mt-2 text-orange-800/90">
            Fields below are pre-filled in dev. Remove this block before production.
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
            type="password"
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
