"use client";

import Link from "next/link";
import { useState } from "react";
import { requestPasswordReset } from "@/app/actions/auth-password";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await requestPasswordReset(email);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Forgot password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter your work email. If an account exists, you will receive a reset link.
        </p>
      </div>

      {done ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-3 text-sm text-emerald-950">
          <p className="font-medium">Check your inbox</p>
          <p className="mt-1 text-xs text-emerald-900/90">
            Follow the link in the email to choose a new password, then sign in.
          </p>
          <Link
            href="/login"
            className="mt-3 inline-block text-sm font-semibold text-orange-700 underline-offset-2 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <label htmlFor="fp-email" className="mb-1 block text-xs font-medium text-slate-600">
              Email
            </label>
            <input
              id="fp-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
          <p className="text-center text-sm text-slate-600">
            <Link href="/login" className="font-semibold text-orange-700 underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </form>
  );
}
