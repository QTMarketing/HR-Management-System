import "./db/dns-prefer-ipv4";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl } from "./db/connection-string";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
