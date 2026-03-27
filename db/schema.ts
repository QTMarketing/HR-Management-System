/**
 * Single source of truth for Postgres DDL: `supabase/migrations/*.sql`
 *
 * This file intentionally does not duplicate production tables. Use Drizzle only for
 * optional tooling (`npm run db:probe`, `drizzle-kit studio` against DATABASE_URL) —
 * do not `db:push` a second competing schema into the same Supabase project.
 */
export {};
