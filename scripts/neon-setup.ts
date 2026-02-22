import pg from "pg";

if (!process.env.NEON_DATABASE_URL) {
  throw new Error("NEON_DATABASE_URL is required (base Neon URL without search_path)");
}

const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL });

console.log("Creating schemas on Neon...");

await pool.query(`CREATE SCHEMA IF NOT EXISTS dev`);
console.log("  ✓ Created schema: dev");

await pool.query(`CREATE SCHEMA IF NOT EXISTS prod`);
console.log("  ✓ Created schema: prod");

console.log("\nSchemas ready. Next steps:");
console.log("  npm run db:neon:push:dev   — push tables to dev schema");
console.log("  npm run db:neon:push:prod  — push tables to prod schema");
console.log("  npm run db:neon:seed:dev   — seed dev with test data");

await pool.end();
