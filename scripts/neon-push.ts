import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

const schema = process.env.NEON_SCHEMA;
if (!schema || !["dev", "prod"].includes(schema)) {
  throw new Error("NEON_SCHEMA must be 'dev' or 'prod'");
}

if (!process.env.NEON_DATABASE_URL) {
  throw new Error("NEON_DATABASE_URL is required in .env");
}

const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL });

console.log(`Pushing tables to Neon [${schema}] schema...`);

// Set search_path to target schema
await pool.query(`SET search_path TO ${schema}`);
await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

// Read the migration SQL
const migrationPath = join(process.cwd(), "migrations", "0000_powerful_silhouette.sql");
let migrationSql = readFileSync(migrationPath, "utf-8");

// Replace "public"."table" references with the target schema
migrationSql = migrationSql.replaceAll('"public".', `"${schema}".`);

// Split by statement breakpoint and execute each
const statements = migrationSql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  try {
    await pool.query(stmt);
  } catch (err: any) {
    // Ignore "already exists" errors (42P07) for idempotency
    if (err.code === "42P07" || err.code === "42710") {
      console.log(`  (skipped — already exists)`);
    } else {
      throw err;
    }
  }
}

// Also create the session table for connect-pg-simple
await pool.query(`
  CREATE TABLE IF NOT EXISTS "${schema}"."session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
  )
`);
await pool.query(`
  CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "${schema}"."session" ("expire")
`);

console.log(`  ✓ All tables created in [${schema}] schema`);

// Verify by listing tables
const result = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = $1
  ORDER BY table_name
`, [schema]);

console.log(`\n  Tables in [${schema}]:`);
for (const row of result.rows) {
  console.log(`    - ${row.table_name}`);
}

await pool.end();
