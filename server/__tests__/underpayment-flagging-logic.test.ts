import { describe, it, expect } from "vitest";

/**
 * Pure underpayment-flagging rule, mirroring the set-based SQL in
 * storage-revenue-recovery.ts flagUnderpaidClaims (R2-5 rewrite). Locks the
 * behavior the old per-claim loop had so the SQL version stays faithful:
 *   expected = ROUND(Σ(latest rate per CPT) * max(units,1), 2)
 *   claims with expected <= 0 (no matching rates) are skipped (not updated)
 *   underpaid when paid < expected * 0.95 (5% tolerance)
 *   underpaidAmount = ROUND(expected - paid, 2) when underpaid, else null
 */

interface ClaimInput {
  units: number | null;
  paid: number;
  rates: number[]; // latest expected_rate per matched CPT code
}
interface FlagResult {
  skipped: boolean;
  expected: number;
  isUnderpaid: boolean;
  underpaidAmount: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function flag(c: ClaimInput): FlagResult {
  const units = Math.max(c.units ?? 0, 1); // GREATEST(COALESCE(units,0),1)
  const expected = round2(c.rates.reduce((s, r) => s + r, 0) * units);
  if (expected <= 0) return { skipped: true, expected, isUnderpaid: false, underpaidAmount: null };
  const isUnderpaid = c.paid < expected * 0.95;
  return {
    skipped: false,
    expected,
    isUnderpaid,
    underpaidAmount: isUnderpaid ? round2(expected - c.paid) : null,
  };
}

describe("underpayment flagging rule", () => {
  it("expected = sum(rates) * units", () => {
    expect(flag({ units: 4, paid: 0, rates: [30, 20] }).expected).toBe(200);
  });

  it("units of 0 or null is floored to 1", () => {
    expect(flag({ units: 0, paid: 0, rates: [120] }).expected).toBe(120);
    expect(flag({ units: null, paid: 0, rates: [120] }).expected).toBe(120);
  });

  it("flags underpaid when paid below 95% of expected", () => {
    const r = flag({ units: 1, paid: 100, rates: [120] }); // 100 < 114
    expect(r.isUnderpaid).toBe(true);
    expect(r.underpaidAmount).toBe(20);
  });

  it("does not flag within the 5% tolerance", () => {
    const r = flag({ units: 1, paid: 115, rates: [120] }); // 115 >= 114
    expect(r.isUnderpaid).toBe(false);
    expect(r.underpaidAmount).toBeNull();
  });

  it("skips claims with no matching rates (expected <= 0, untouched)", () => {
    expect(flag({ units: 3, paid: 50, rates: [] }).skipped).toBe(true);
  });

  it("rounds expected and underpaid amount to cents", () => {
    const r = flag({ units: 3, paid: 50, rates: [33.337] }); // 100.011 -> 100.01; 50 < 95.01
    expect(r.expected).toBe(100.01);
    expect(r.isUnderpaid).toBe(true);
    expect(r.underpaidAmount).toBe(50.01);
  });
});
