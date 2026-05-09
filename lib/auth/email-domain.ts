/**
 * Optional org lock: comma-separated domains in `ALLOWED_AUTH_EMAIL_DOMAINS`
 * (e.g. `yourcompany.com,subsidiary.com`). When unset, all domains are allowed.
 */
export function emailDomainNotAllowedMessage(email: string): string | null {
  const raw = process.env.ALLOWED_AUTH_EMAIL_DOMAINS?.trim();
  if (!raw) return null;
  const domains = raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return "Enter a valid work email address.";
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || !domains.includes(domain)) {
    return "This email domain is not allowed for your organization.";
  }
  return null;
}
