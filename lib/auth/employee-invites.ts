import { emailDomainNotAllowedMessage } from "@/lib/auth/email-domain";
import { getPublicSiteUrl } from "@/lib/auth/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Sends Supabase invite emails so new hires can set a password via `/set-password`.
 * Emails are de-duplicated (case-insensitive). Failures are returned as human-readable lines.
 */
export async function sendEmployeeInviteEmails(emails: string[]): Promise<string[]> {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const unique = emails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => {
      if (!e || seen.has(e)) return false;
      seen.add(e);
      return true;
    });

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return unique.map(
      (e) =>
        `${e}: Invite skipped — set SUPABASE_SERVICE_ROLE_KEY on the server to send invite emails.`,
    );
  }

  const siteUrl = getPublicSiteUrl();
  const nextPath = "/set-password";
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  for (const email of unique) {
    const domainErr = emailDomainNotAllowedMessage(email);
    if (domainErr) {
      warnings.push(`${email}: ${domainErr}`);
      continue;
    }
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (error) {
      warnings.push(`${email}: ${error.message}`);
    }
  }
  return warnings;
}
