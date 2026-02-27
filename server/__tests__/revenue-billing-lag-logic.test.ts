import { describe, it, expect } from "vitest";

/**
 * Pure billing lag calculation tests.
 * Mirrors logic in storage-billing-lag.ts:
 *   - aging buckets from days since DOS
 *   - days to submission (DOS → submission_date)
 *   - days to payment (submission_date → payment_date)
 *   - stale claim detection when lag exceeds threshold
 */

// ---------------------------------------------------------------------------
// Aging bucket — mirrors SQL CASE WHEN in billing lag queries
// ---------------------------------------------------------------------------
function agingBucket(daysSinceDos: number): string {
  if (daysSinceDos <= 30) return "0-30";
  if (daysSinceDos <= 60) return "31-60";
  if (daysSinceDos <= 90) return "61-90";
  return "90+";
}

// ---------------------------------------------------------------------------
// Days DOS → submission — mirrors: submission_date - dos
// ---------------------------------------------------------------------------
function daysToSubmission(dos: string, submissionDate: string | null): number | null {
  if (!submissionDate) return null;
  const d = new Date(dos);
  const s = new Date(submissionDate);
  return Math.floor((s.getTime() - d.getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// Days submission → payment — mirrors: payment_date - submission_date
// ---------------------------------------------------------------------------
function daysToPayment(submissionDate: string, paymentDate: string | null): number | null {
  if (!paymentDate) return null;
  const s = new Date(submissionDate);
  const p = new Date(paymentDate);
  return Math.floor((p.getTime() - s.getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// Stale claim — submitted late or not yet submitted past threshold
// ---------------------------------------------------------------------------
function isStale(dos: string, submissionDate: string | null, thresholdDays: number = 7): boolean {
  if (submissionDate) {
    return daysToSubmission(dos, submissionDate)! > thresholdDays;
  }
  const now = new Date();
  const d = new Date(dos);
  const daysSince = Math.floor((now.getTime() - d.getTime()) / 86400000);
  return daysSince > thresholdDays;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Billing Lag Calculations", () => {
  describe("agingBucket", () => {
    it("0-30 for recent", () => expect(agingBucket(15)).toBe("0-30"));
    it("0-30 boundary", () => expect(agingBucket(30)).toBe("0-30"));
    it("31-60", () => expect(agingBucket(45)).toBe("31-60"));
    it("61-90", () => expect(agingBucket(75)).toBe("61-90"));
    it("90+", () => expect(agingBucket(120)).toBe("90+"));
    it("91 days", () => expect(agingBucket(91)).toBe("90+"));
  });

  describe("daysToSubmission", () => {
    it("calculates correctly", () => {
      expect(daysToSubmission("2026-01-01", "2026-01-04")).toBe(3);
    });
    it("same day", () => {
      expect(daysToSubmission("2026-01-01", "2026-01-01")).toBe(0);
    });
    it("null when no submission", () => {
      expect(daysToSubmission("2026-01-01", null)).toBe(null);
    });
  });

  describe("daysToPayment", () => {
    it("calculates correctly", () => {
      expect(daysToPayment("2026-01-04", "2026-02-03")).toBe(30);
    });
    it("null when no payment", () => {
      expect(daysToPayment("2026-01-04", null)).toBe(null);
    });
  });

  describe("isStale", () => {
    it("not stale when submitted within threshold", () => {
      expect(isStale("2026-01-01", "2026-01-03", 7)).toBe(false);
    });
    it("stale when submitted late", () => {
      expect(isStale("2026-01-01", "2026-01-15", 7)).toBe(true);
    });
    it("stale when not submitted and beyond threshold", () => {
      // DOS was a year ago, no submission
      expect(isStale("2025-01-01", null, 7)).toBe(true);
    });
  });
});
