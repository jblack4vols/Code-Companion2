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

      // Unit economics indexes
      `CREATE INDEX IF NOT EXISTS idx_clinic_fin_location_period ON clinic_financials (location_id, period_date)`,
      `CREATE INDEX IF NOT EXISTS idx_clinic_fin_period_type ON clinic_financials (period_type, period_date)`,
      `CREATE INDEX IF NOT EXISTS idx_provider_prod_user ON provider_productivity (user_id, week_start_date)`,
      `CREATE INDEX IF NOT EXISTS idx_fin_alerts_unack ON financial_alerts (acknowledged_at) WHERE acknowledged_at IS NULL`,
    ];

    for (const idx of indexes) {
      await db.execute(sql.raw(idx));
    }
    console.log("[DB] Search indexes ensured");
  } catch (err) {
    console.warn("[DB] Could not create search indexes:", err);
  }
}

/**
 * Create Revenue Leakage Recovery Engine tables if they don't exist.
 * Uses CREATE TABLE IF NOT EXISTS to be safe on repeated startup.
 */
export async function ensureRevenueRecoveryTables() {
  try {
    const statements = [
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_status') THEN CREATE TYPE claim_status AS ENUM ('SUBMITTED','PAID','PARTIAL','DENIED','APPEALED','ADJUSTED','VOID'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appeal_status') THEN CREATE TYPE appeal_status AS ENUM ('DRAFTED','SUBMITTED','WON','LOST','WITHDRAWN'); END IF; END $$`,
      `CREATE TABLE IF NOT EXISTS claims (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        claim_number VARCHAR(50) NOT NULL,
        location_id VARCHAR(36) REFERENCES locations(id),
        provider_id VARCHAR(36),
        physician_id VARCHAR(36) REFERENCES physicians(id),
        patient_account_number VARCHAR(50),
        dos DATE NOT NULL,
        cpt_codes TEXT,
        units INTEGER DEFAULT 0,
        payer VARCHAR(100),
        payer_type VARCHAR(50),
        billed_amount NUMERIC(12,2) DEFAULT 0,
        expected_amount NUMERIC(12,2),
        paid_amount NUMERIC(12,2) DEFAULT 0,
        adjustment_amount NUMERIC(12,2) DEFAULT 0,
        patient_responsibility NUMERIC(12,2) DEFAULT 0,
        status claim_status DEFAULT 'SUBMITTED',
        submission_date DATE,
        payment_date DATE,
        denial_codes TEXT,
        denial_reason TEXT,
        is_underpaid BOOLEAN DEFAULT false,
        underpaid_amount NUMERIC(12,2),
        source VARCHAR(50) DEFAULT 'import',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS claim_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        claim_id UUID NOT NULL REFERENCES claims(id),
        payment_date DATE NOT NULL,
        paid_amount NUMERIC(12,2) NOT NULL,
        adjustment_amount NUMERIC(12,2) DEFAULT 0,
        adjustment_codes TEXT,
        check_number VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS payer_rate_schedule (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payer VARCHAR(100) NOT NULL,
        payer_type VARCHAR(50),
        cpt_code VARCHAR(10) NOT NULL,
        expected_rate NUMERIC(10,2) NOT NULL,
        effective_date DATE,
        location_id VARCHAR(36) REFERENCES locations(id),
        source VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS appeal_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        denial_code_pattern VARCHAR(50),
        template_text TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS appeals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        claim_id UUID NOT NULL REFERENCES claims(id),
        template_id UUID REFERENCES appeal_templates(id),
        generated_text TEXT NOT NULL,
        status appeal_status DEFAULT 'DRAFTED',
        submitted_date DATE,
        outcome_date DATE,
        outcome_notes TEXT,
        recovered_amount NUMERIC(12,2),
        created_by VARCHAR(36) REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_claims_location ON claims(location_id)`,
      `CREATE INDEX IF NOT EXISTS idx_claims_dos ON claims(dos)`,
      `CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status)`,
      `CREATE INDEX IF NOT EXISTS idx_claims_payer ON claims(payer)`,
      `CREATE INDEX IF NOT EXISTS idx_claims_underpaid ON claims(is_underpaid)`,
      `CREATE INDEX IF NOT EXISTS idx_claim_payments_claim ON claim_payments(claim_id)`,
      `CREATE INDEX IF NOT EXISTS idx_payer_rate_payer_cpt ON payer_rate_schedule(payer, cpt_code)`,
      `CREATE INDEX IF NOT EXISTS idx_appeals_claim ON appeals(claim_id)`,
      `CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status)`,
    ];

    for (const stmt of statements) {
      try {
        await db.execute(sql.raw(stmt));
      } catch (e: any) {
        // Ignore "already exists" errors for types
        if (!e?.message?.includes("already exists")) throw e;
      }
    }
    console.log("[DB] Revenue recovery tables ensured");
  } catch (err) {
    console.warn("[DB] Could not create revenue recovery tables:", err);
  }
}
