/**
 * Normalizes DATABASE_URL for Postgres (Supabase): SSL + bounded connect time.
 * Use for Drizzle CLI and the app `pg` Pool so behavior matches.
 *
 * If sslmode is unset, use libpq-compatible `require` (see node-pg / pg-connection-string).
 * Supabase pooler hostnames often conflict with strict verify-full cert names.
 */
export function normalizeDatabaseUrl(connectionString: string): string {
  if (!connectionString) return connectionString;
  const qIndex = connectionString.indexOf("?");
  const base = qIndex === -1 ? connectionString : connectionString.slice(0, qIndex);
  const existing = qIndex === -1 ? "" : connectionString.slice(qIndex + 1);
  const params = new URLSearchParams(existing);
  if (!params.has("sslmode")) {
    params.set("uselibpqcompat", "true");
    params.set("sslmode", "require");
  }
  if (!params.has("connect_timeout")) params.set("connect_timeout", "15");
  return `${base}?${params.toString()}`;
}

/**
 * If `DATABASE_PASSWORD` is set, merges it into `DATABASE_URL` using the URL API so
 * special characters (e.g. `@`) are encoded correctly. Use when the password must not
 * be embedded in the URI string.
 *
 * With `DATABASE_PASSWORD`, `DATABASE_URL` should omit the password, e.g.:
 * `postgresql://postgres@db.xxxxx.supabase.co:5432/postgres`
 */
export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim() ?? "";
  const extraPassword = process.env.DATABASE_PASSWORD;

  if (!raw) return "";

  if (!extraPassword) {
    return normalizeDatabaseUrl(raw);
  }

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return normalizeDatabaseUrl(raw);
  }

  const p = u.protocol.toLowerCase();
  if (p !== "postgres:" && p !== "postgresql:") {
    return normalizeDatabaseUrl(raw);
  }

  u.password = extraPassword;
  return normalizeDatabaseUrl(u.toString());
}
