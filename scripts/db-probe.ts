/**
 * Run: npm run db:probe
 * Verifies DATABASE_URL is a Postgres URI and prints connection errors clearly.
 */
import "../db/dns-prefer-ipv4";
import { config } from "dotenv";
import { Client } from "pg";
import { resolveDatabaseUrl } from "../db/connection-string";

config({ path: ".env.local" });
config({ path: ".env" });

/** Authority = userinfo@host:port — must contain exactly one @ before the host. */
function authorityAtCount(connectionString: string): number {
  const m = connectionString.match(/^postgres(ql)?:\/\/([^/?#]+)/i);
  if (!m) return 0;
  return (m[2].match(/@/g) ?? []).length;
}

/** Redact password using the last @ (correct split even if password contained unencoded @). */
function safeRedactPostgresUrl(connectionString: string): string {
  const m = connectionString.match(/^(postgres(ql)?:\/\/)([^/?#]+)(.*)$/i);
  if (!m) return connectionString.replace(/:[^:@/]+@/, ":****@");
  const authority = m[3];
  const lastAt = authority.lastIndexOf("@");
  if (lastAt === -1) return connectionString;
  const hostPart = authority.slice(lastAt + 1);
  const userPart = authority.slice(0, lastAt);
  const user = userPart.match(/^([^:]+)/)?.[1] ?? "postgres";
  return `${m[1]}${user}:****@${hostPart}${m[4]}`;
}

const raw = process.env.DATABASE_URL?.trim();
const hasSeparatePassword = Boolean(process.env.DATABASE_PASSWORD?.length);

if (!raw) {
  const hasSupabase =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  console.error(
    "DATABASE_URL is not set in .env.local.\n\n" +
      "This command only tests a direct Postgres connection (Drizzle / pg / db:push).\n" +
      "If you are using only the Supabase HTTP client (NEXT_PUBLIC_* keys) for now, you can skip npm run db:probe.\n" +
      (hasSupabase
        ? "\nWhen you add Drizzle or run db:push again, add DATABASE_URL (see .env.example).\n"
        : "\nAdd DATABASE_URL when you connect Postgres — see .env.example.\n"),
  );
  process.exit(1);
}

const lower = raw.toLowerCase();
if (lower.startsWith("http://") || lower.startsWith("https://")) {
  console.error(
    "DATABASE_URL looks like a Supabase project URL (https://...), not a Postgres connection string.\n" +
      "Fix: Supabase → Project Settings → Database → Connection string → URI\n" +
      "Use a string starting with postgres:// or postgresql:// (host, user, password, port 5432).",
  );
  process.exit(1);
}

if (!lower.startsWith("postgres://") && !lower.startsWith("postgresql://")) {
  console.error(
    "DATABASE_URL must start with postgres:// or postgresql:// (got: " +
      raw.slice(0, 24) +
      "...)",
  );
  process.exit(1);
}

// Common mistakes: template placeholders or brackets around the password
if (
  /\[YOUR-?PASSWORD\]/i.test(raw) ||
  raw.includes("[YOUR_PASSWORD]") ||
  (raw.includes(":[") && raw.includes("]@"))
) {
  console.error(
    "DATABASE_URL must not use square brackets [ ] around the password.\n" +
      "Supabase templates like [YOUR-PASSWORD] are placeholders — paste your real password only,\n" +
      "or use Database → Connection string → Copy (full URI) so brackets are not included.",
  );
  process.exit(1);
}

// Password must not contain a raw @ — unless DATABASE_PASSWORD is set (we encode in code).
if (!hasSeparatePassword && authorityAtCount(raw) > 1) {
  console.error(
    "DATABASE_URL is invalid: your password contains @ but it is not URL-encoded.\n" +
      "Fix A: Supabase → Database → Connection string → Copy URI (encodes for you).\n" +
      "Fix B: Add DATABASE_PASSWORD with your raw password (any characters) and set DATABASE_URL without a password, e.g.\n" +
      "  DATABASE_URL=postgresql://postgres@db.xxxxx.supabase.co:5432/postgres\n" +
      "  DATABASE_PASSWORD=your-actual-password",
  );
  process.exit(1);
}

const connectionString = resolveDatabaseUrl();
if (!connectionString) {
  console.error("Could not build connection string from DATABASE_URL / DATABASE_PASSWORD.");
  process.exit(1);
}

if (hasSeparatePassword) {
  console.log("(using DATABASE_PASSWORD for credentials)");
}
console.log("Trying:", safeRedactPostgresUrl(connectionString));

const client = new Client({ connectionString });

client
  .connect()
  .then(() => client.query("select 1 as ok"))
  .then((res) => {
    console.log("OK — connected. Row:", res.rows[0]);
    return client.end();
  })
  .then(() => {
    console.log("You can run npm run db:push next.");
    process.exit(0);
  })
  .catch((err: Error & { code?: string }) => {
    console.error("\nConnection failed:\n");
    console.error(err.message);
    if (err.code) console.error("code:", err.code);
    if (err.code === "28P01") {
      console.error(
        "\nHint (28P01): Wrong password or password not URL-encoded.\n" +
          "Remove any [ ] brackets; use the exact DB password from Supabase (or reset it and paste the new URI).",
      );
    }
    if (err.code === "ECONNREFUSED") {
      const v6 = /[0-9a-f]{0,4}:[0-9a-f:]+:5432/i.test(err.message);
      console.error(
        v6
          ? "\nHint (ECONNREFUSED on IPv6): This project prefers IPv4 for Postgres DNS. " +
              "If it still fails, your network may block outbound 5432 — try another network or VPN, " +
              "or use Supabase Session pooler URI from the dashboard."
          : "\nHint (ECONNREFUSED): Check host/port, firewall, and that Supabase allows your IP if restricted.",
      );
    }
    process.exit(1);
  });
