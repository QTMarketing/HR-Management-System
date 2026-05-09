"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SetPasswordForm() {
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    void (async () => {
      if (typeof window !== "undefined" && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { error: se } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (!cancelled && se) {
            setError(se.message);
          }
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        setNoSession(true);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    // Hard navigation: same reason as login — gives middleware one clean
    // pass with the freshly-authenticated cookie and a fresh dashboard shell.
    window.location.assign("/");
  }

  if (!ready) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-500">Preparing secure session…</p>
      </div>
    );
  }

  if (noSession) {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Link expired or invalid</h1>
        <p className="text-sm text-slate-600">
          Open the latest invite or reset email from your inbox, or ask a manager to send a new
          invite.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Set your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose a strong password for your work account. You will be signed in to the dashboard
          when you continue.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <div>
          <label htmlFor="sp-password" className="mb-1 block text-xs font-medium text-slate-600">
            New password
          </label>
          <input
            id="sp-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
          />
        </div>
        <div>
          <label htmlFor="sp-confirm" className="mb-1 block text-xs font-medium text-slate-600">
            Confirm password
          </label>
          <input
            id="sp-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {loading ? "Saving…" : "Save and continue"}
      </button>

      <p className="text-center text-sm text-slate-600">
        <Link href="/login" className="font-semibold text-orange-700 underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
