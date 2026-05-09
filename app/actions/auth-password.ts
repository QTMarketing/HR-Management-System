"use server";

import { emailDomainNotAllowedMessage } from "@/lib/auth/email-domain";
import { getPublicSiteUrl } from "@/lib/auth/site-url";
import { createClient } from "@supabase/supabase-js";

export type RequestPasswordResetResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Triggers Supabase’s password recovery email. Response is always success-shaped
 * after validation so callers cannot infer whether an address exists in Auth.
 */
export async function requestPasswordReset(emailRaw: string): Promise<RequestPasswordResetResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const domainErr = emailDomainNotAllowedMessage(email);
  if (domainErr) {
    return { ok: false, error: domainErr };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { ok: false, error: "Sign-in is not configured." };
  }

  const siteUrl = getPublicSiteUrl();
  const nextPath = "/set-password";
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    console.error("[auth] resetPasswordForEmail:", error.message);
  }
  return { ok: true };
}
