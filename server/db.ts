import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function ensureSearchIndexes() {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_physicians_firstname_trgm ON physicians USING gin (first_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_lastname_trgm ON physicians USING gin (last_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_practicename_trgm ON physicians USING gin (practice_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_city_trgm ON physicians USING gin (city gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_provider_trgm ON referrals USING gin (referring_provider_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_patient_trgm ON referrals USING gin (patient_full_name gin_trgm_ops)`,
    ];

    for (const idx of indexes) {
      await db.execute(sql.raw(idx));
    }
    console.log("[DB] Search indexes ensured");
  } catch (err) {
    console.warn("[DB] Could not create search indexes:", err);
  }
}
