/**
 * Absolute origin for auth redirect URLs (invite + password recovery).
 * Set `NEXT_PUBLIC_SITE_URL` in production (e.g. https://app.yourcompany.com).
 */
export function getPublicSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }
  return "http://localhost:3000";
}
