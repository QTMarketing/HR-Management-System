import dns from "node:dns";

/**
 * Prefer IPv4 when resolving database hostnames. Supabase exposes IPv6; some networks
 * refuse outbound IPv6 to port 5432, causing ECONNREFUSED on 2600:... addresses.
 * Safe to call once per process (Next.js server, drizzle-kit, db-probe).
 */
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
