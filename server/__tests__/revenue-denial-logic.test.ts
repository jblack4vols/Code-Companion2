import { describe, it, expect } from "vitest";

/**
 * Pure denial analysis logic tests.
 * Mirrors aggregation math in storage-denial-intelligence.ts:
 *   - denial_rate = denied / total * 100
 *   - outlier detection via multiplier threshold
 *   - denial code parsing from comma-separated strings
 *   - total at-risk summation across denied claims
 */

// ---------------------------------------------------------------------------
// Denial rate — mirrors SQL: COUNT(denied) / COUNT(*) * 100
// ---------------------------------------------------------------------------
function denialRate(totalClaims: number, deniedClaims: number): number {
  if (totalClaims === 0) return 0;
  return Math.round((deniedClaims / totalClaims) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Outlier detection — provider denial rate vs practice average
// ---------------------------------------------------------------------------
function isOutlier(providerRate: number, avgRate: number, multiplier: number = 2): boolean {
  return providerRate > avgRate * multiplier;
}

// ---------------------------------------------------------------------------
// Denial code parsing — mirrors: cpt_codes split logic and denial_codes field
// ---------------------------------------------------------------------------
function parseDenialCodes(codesString: string | null): string[] {
  if (!codesString) return [];
  return codesString.split(",").map(c => c.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Total at-risk — sum of billed amounts across denied claims
// ---------------------------------------------------------------------------
function totalAtRisk(deniedClaims: Array<{ billedAmount: number }>): number {
  return deniedClaims.reduce((sum, c) => sum + c.billedAmount, 0);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Denial Analysis", () => {
  describe("denialRate", () => {
    it("calculates percentage", () => expect(denialRate(100, 8)).toBe(8));
    it("zero claims", () => expect(denialRate(0, 0)).toBe(0));
    it("no denials", () => expect(denialRate(50, 0)).toBe(0));
    it("all denied", () => expect(denialRate(10, 10)).toBe(100));
    it("rounds to 1 decimal", () => expect(denialRate(3, 1)).toBe(33.3));
  });

  describe("isOutlier", () => {
    it("true when >2x average", () => expect(isOutlier(20, 8)).toBe(true));
    it("false when at 2x", () => expect(isOutlier(16, 8)).toBe(false));
    it("false when below", () => expect(isOutlier(10, 8)).toBe(false));
    it("custom multiplier", () => expect(isOutlier(25, 10, 3)).toBe(false));
  });

  describe("parseDenialCodes", () => {
    it("splits comma-separated", () => {
      expect(parseDenialCodes("CO-50,CO-4,PR-1")).toEqual(["CO-50", "CO-4", "PR-1"]);
    });
    it("handles spaces", () => {
      expect(parseDenialCodes("CO-50 , CO-4")).toEqual(["CO-50", "CO-4"]);
    });
    it("handles null", () => expect(parseDenialCodes(null)).toEqual([]));
    it("handles empty string", () => expect(parseDenialCodes("")).toEqual([]));
    it("single code", () => expect(parseDenialCodes("CO-50")).toEqual(["CO-50"]));
  });

  describe("totalAtRisk", () => {
    it("sums billed amounts", () => {
      const claims = [{ billedAmount: 100 }, { billedAmount: 250 }, { billedAmount: 175 }];
      expect(totalAtRisk(claims)).toBe(525);
    });
    it("empty array", () => expect(totalAtRisk([])).toBe(0));
  });
});
