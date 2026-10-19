-- Claim-number de-duplication runbook (prerequisite for R2-1's unique index).
--
-- Context: before migration R2-1 (claims_claim_number_unique), the claims import
-- could create rows sharing a claim_number. That unique index will FAIL to create
-- while duplicates exist. Run this FIRST, against the SAME DATABASE_URL the app /
-- `npm run db:push` uses (production = the live Neon DB — treat accordingly).
--
-- Strategy: keep ONE canonical row per claim_number (newest by updated_at, then
-- created_at, then id), repoint child rows (claim_payments, appeals) to the
-- survivor so nothing is orphaned, delete the duplicate claim rows. Wrapped in a
-- transaction — inspect, then COMMIT or ROLLBACK.
--
-- Survivor rule is a heuristic; change the ORDER BY in step 1 if you'd rather keep
-- by data completeness or a specific `source`.

-- ---------------------------------------------------------------------------
-- Pre-check: are there duplicates at all? (0 rows => skip this script entirely.)
-- SELECT claim_number, COUNT(*) FROM claims GROUP BY claim_number HAVING COUNT(*) > 1;
-- ---------------------------------------------------------------------------

BEGIN;

-- 0) Confirm no tables OTHER than claim_payments / appeals reference claims.id.
--    If this lists anything else, STOP and extend the repoint (step 3) first.
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu   ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'claims' AND ccu.column_name = 'id';

-- 1) dup -> survivor map.
CREATE TEMP TABLE claim_dupes ON COMMIT DROP AS
WITH ranked AS (
  SELECT id, claim_number,
         row_number() OVER (PARTITION BY claim_number
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id) AS rn,
         first_value(id) OVER (PARTITION BY claim_number
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id) AS keep_id
  FROM claims
)
SELECT id AS dup_id, keep_id, claim_number FROM ranked WHERE rn > 1;

-- 2) Review what will be merged away before committing.
SELECT * FROM claim_dupes ORDER BY claim_number;

-- 3) Repoint children to the surviving claim.
UPDATE claim_payments p SET claim_id = d.keep_id FROM claim_dupes d WHERE p.claim_id = d.dup_id;
UPDATE appeals        a SET claim_id = d.keep_id FROM claim_dupes d WHERE a.claim_id = d.dup_id;

-- 4) Delete duplicate claim rows.
DELETE FROM claims WHERE id IN (SELECT dup_id FROM claim_dupes);

-- 5) Verify none remain (MUST be 0 rows).
SELECT claim_number, COUNT(*) FROM claims GROUP BY claim_number HAVING COUNT(*) > 1;

COMMIT;   -- looks right? commit.  Otherwise: ROLLBACK;

-- Then: `npm run db:push` — claims_claim_number_unique now creates cleanly.
