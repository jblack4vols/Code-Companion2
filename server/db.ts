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

    await db.execute(sql.raw(`DROP INDEX IF EXISTS idx_physicians_npi_trgm`));

    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_physicians_firstname_trgm ON physicians USING gin (first_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_lastname_trgm ON physicians USING gin (last_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_practicename_trgm ON physicians USING gin (practice_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_city_trgm ON physicians USING gin (city gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_provider_trgm ON referrals USING gin (referring_provider_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_patient_trgm ON referrals USING gin (patient_full_name gin_trgm_ops)`,

      `CREATE INDEX IF NOT EXISTS idx_physicians_npi ON physicians (npi) WHERE npi IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_lastname_btree ON physicians (last_name)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_status ON physicians (status)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_stage ON physicians (relationship_stage)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_territory ON physicians (territory_id) WHERE territory_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_assigned ON physicians (assigned_owner_id) WHERE assigned_owner_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_deleted ON physicians (deleted_at) WHERE deleted_at IS NULL`,

      `CREATE INDEX IF NOT EXISTS idx_referrals_physician ON referrals (physician_id) WHERE physician_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_location ON referrals (location_id) WHERE location_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_date ON referrals (referral_date)`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals (status)`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_deleted ON referrals (deleted_at) WHERE deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_account ON referrals (patient_account_number) WHERE patient_account_number IS NOT NULL`,

      `CREATE INDEX IF NOT EXISTS idx_interactions_physician ON interactions (physician_id)`,
      `CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_interactions_occurred ON interactions (occurred_at)`,

      `CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks (assigned_to_user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_at)`,

      `CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events (start_at)`,
      `CREATE INDEX IF NOT EXISTS idx_calendar_organizer ON calendar_events (organizer_user_id)`,

      `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`,
      `CREATE INDEX IF NOT EXISTS idx_users_approval ON users (approval_status)`,
      `CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (password_reset_token) WHERE password_reset_token IS NOT NULL`,

      `CREATE INDEX IF NOT EXISTS idx_locations_name ON locations (name)`,
      `CREATE INDEX IF NOT EXISTS idx_territories_name ON territories (name)`,

      `CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity, entity_id)`,

      `CREATE INDEX IF NOT EXISTS idx_monthly_physician ON physician_monthly_summary (physician_id, month)`,
      `CREATE INDEX IF NOT EXISTS idx_monthly_territory ON territory_monthly_summary (territory_id, month)`,
      `CREATE INDEX IF NOT EXISTS idx_monthly_location ON location_monthly_summary (location_id, month)`,
    ];

    for (const idx of indexes) {
      await db.execute(sql.raw(idx));
    }
    console.log("[DB] Search indexes ensured");
  } catch (err) {
    console.warn("[DB] Could not create search indexes:", err);
  }
}
