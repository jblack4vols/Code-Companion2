import { describe, it, expect } from "vitest";

/**
 * Pure reimbursement calculation tests.
 * Mirrors the math in storage-revenue-recovery.ts:
 *   - underpaid_amount = expected - paid
 *   - variance_pct = (underpaid_amount / expected) * 100
 *   - avg_realization_pct = paid / billed * 100
 *   - flagUnderpaidClaims tolerance: 5%
 */

// ---------------------------------------------------------------------------
// Variance: expected minus actual paid — mirrors SQL COALESCE + subtraction
// ---------------------------------------------------------------------------
function calculateVariance(expected: number, paid: number): number {
  return Math.round((expected - paid) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Underpayment flag — mirrors: paid < expected * 0.95 (5% tolerance)
// Custom tolerance overrides default 2% for flexibility in tests
// ---------------------------------------------------------------------------
function isUnderpaid(expected: number, paid: number, tolerancePct: number = 2): boolean {
  if (expected <= 0 || paid <= 0) return false;
  const variance = ((expected - paid) / expected) * 100;
  return variance > tolerancePct;
}

// ---------------------------------------------------------------------------
// Realization percent — mirrors SQL: paid / billed * 100
// ---------------------------------------------------------------------------
function realizationPercent(paid: number, billed: number): number {
  if (billed === 0) return 0;
  return Math.round((paid / billed) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Estimated recovery from leakage at a given rate — used in dashboard
// ---------------------------------------------------------------------------
function estimatedRecovery(totalUnderpaid: number, recoveryRate: number): number {
  return Math.round(totalUnderpaid * (recoveryRate / 100) * 100) / 100;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Reimbursement Calculations", () => {
  describe("calculateVariance", () => {
    it("positive when expected > paid (underpaid)", () => {
      expect(calculateVariance(103, 87)).toBe(16);
    });
    it("negative when paid > expected (overpaid)", () => {
      expect(calculateVariance(80, 95)).toBe(-15);
    });
    it("zero when equal", () => {
      expect(calculateVariance(100, 100)).toBe(0);
    });
    it("handles decimals", () => {
      expect(calculateVariance(103.50, 87.25)).toBe(16.25);
    });
  });

  describe("isUnderpaid", () => {
    it("true when variance exceeds tolerance", () => {
      expect(isUnderpaid(103, 87)).toBe(true); // 15.5% variance > 2%
    });
    it("false when within tolerance", () => {
      expect(isUnderpaid(100, 99)).toBe(false); // 1% < 2%
    });
    it("false when paid equals expected", () => {
      expect(isUnderpaid(100, 100)).toBe(false);
    });
    it("false when overpaid", () => {
      expect(isUnderpaid(80, 95)).toBe(false);
    });
    it("false when expected is zero", () => {
      expect(isUnderpaid(0, 50)).toBe(false);
    });
    it("respects custom tolerance", () => {
      expect(isUnderpaid(100, 94, 5)).toBe(true); // 6% > 5%
      expect(isUnderpaid(100, 96, 5)).toBe(false); // 4% < 5%
    });
  });

  describe("realizationPercent", () => {
    it("100% when fully paid", () => {
      expect(realizationPercent(100, 100)).toBe(100);
    });
    it("calculates correctly", () => {
      expect(realizationPercent(85, 100)).toBe(85);
    });
    it("over 100% when overpaid", () => {
      expect(realizationPercent(110, 100)).toBe(110);
    });
    it("zero when billed is zero", () => {
      expect(realizationPercent(50, 0)).toBe(0);
    });
  });

  describe("estimatedRecovery", () => {
    // 5600 visits * $95 avg * 1% = $5,320/month leakage
    it("calculates annual recovery from leakage", () => {
      const monthlyLeakage = 5320;
      const recovery = estimatedRecovery(monthlyLeakage * 12, 50);
      expect(recovery).toBe(31920); // 50% recovery rate on $63,840
    });
    it("zero recovery rate", () => {
      expect(estimatedRecovery(10000, 0)).toBe(0);
    });
  });
});
