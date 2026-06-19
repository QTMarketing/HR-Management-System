/** Human-readable copy for Hub SSO login redirect errors. */
const SSO_LOGIN_ERRORS: Record<string, string> = {
  sso_missing_token: "Sign-in link was incomplete. Launch Staff Operations from QuickTrack Hub again.",
  sso_not_configured: "Single sign-on is not configured on this server. Contact IT.",
  sso_invalid_token: "Sign-in link expired or is invalid. Launch Staff Operations from QuickTrack Hub again.",
  sso_no_employee:
    "No Staff Operations account is linked to this Hub user. Ask HR to add your work email to the employee directory.",
  sso_account_ambiguous:
    "Multiple HR accounts match this email. Contact HR to link your Hub login.",
  sso_account_conflict:
    "This Hub account cannot be linked automatically. Contact HR or IT.",
  sso_inactive_employee: "Your Staff Operations account is inactive. Contact HR.",
  sso_auth_user: "Could not prepare your account for sign-in. Contact IT.",
  sso_session_failed: "Could not complete sign-in. Try launching from Hub again.",
};

export function formatSsoLoginError(error: string | null | undefined): string | null {
  if (!error?.trim()) return null;
  const key = error.trim();
  return SSO_LOGIN_ERRORS[key] ?? key;
}
