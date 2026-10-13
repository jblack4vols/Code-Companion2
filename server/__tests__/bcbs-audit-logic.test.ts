import { describe, it, expect } from "vitest";

/**
 * Pure BCBS Audit Status logic tests.
 * Mirrors the aggregation in storage-bcbs-audit.ts (getBcbsAuditStatus) without a DB:
 *   - default BCBS payer matching (ILIKE '%blue%' / '%bcbs%')
 *   - $ at risk = Σ underpaid + Σ (billed − paid) on DENIED claims
 *   - appeal win rate % = won / (won + lost)
 *   - flagged-claim selection (DENIED or underpaid), sorted by underpaid desc
 */

// ---------------------------------------------------------------------------
// Payer matching — mirrors payerCondition(): default BCBS, else exact payer
// ---------------------------------------------------------------------------
function matchesPayer(payer: string | null, override?: string): boolean {
  if (override) return payer === override;
  const p = (payer || "").toLowerCase();
  return p.includes("blue") || p.includes("bcbs");
}

// ---------------------------------------------------------------------------
// $ at risk — mirrors the KPI roll-up
// ---------------------------------------------------------------------------
interface Claim {
  status: string;
  billed: number;
  paid: number;
  isUnderpaid: boolean;
  underpaid: number;
}
function atRisk(claims: Claim[]): number {
  const underpaidExposure = claims.reduce((s, c) => s + (c.isUnderpaid ? c.underpaid : 0), 0);
  const deniedOutstanding = claims
    .filter((c) => c.status === "DENIED")
    .reduce((s, c) => s + Math.max(c.billed - c.paid, 0), 0);
  return underpaidExposure + deniedOutstanding;
}

// ---------------------------------------------------------------------------
// Appeal win rate — mirrors appealWinPct rounding to one decimal
// ---------------------------------------------------------------------------
function appealWinPct(won: number, lost: number): number {
  const decided = won + lost;
  return decided > 0 ? Math.round((won / decided) * 1000) / 10 : 0;
}

// ---------------------------------------------------------------------------
// Flagged claims — DENIED or underpaid, sorted by underpaid desc
// ---------------------------------------------------------------------------
function flagged(claims: Claim[]): Claim[] {
  return claims
    .filter((c) => c.status === "DENIED" || c.isUnderpaid)
    .sort((a, b) => b.underpaid - a.underpaid);
}

describe("BCBS payer matching", () => {
  it("matches common BCBS payer name variants by default", () => {
    expect(matchesPayer("Blue Cross")).toBe(true);
    expect(matchesPayer("BlueCross BlueShield of TN")).toBe(true);
    expect(matchesPayer("BCBS")).toBe(true);
    expect(matchesPayer("bcbs tn")).toBe(true);
  });

  it("excludes non-BCBS payers by default", () => {
    expect(matchesPayer("Aetna")).toBe(false);
    expect(matchesPayer("Medicare")).toBe(false);
    expect(matchesPayer(null)).toBe(false);
  });

  it("honors an explicit payer override exactly", () => {
    expect(matchesPayer("Aetna", "Aetna")).toBe(true);
    expect(matchesPayer("Blue Cross", "Aetna")).toBe(false);
  });
});

describe("$ at risk", () => {
  it("sums underpaid exposure plus denied outstanding balance", () => {
    const claims: Claim[] = [
      { status: "PARTIAL", billed: 480, paid: 360, isUnderpaid: true, underpaid: 60 },
      { status: "DENIED", billed: 330, paid: 0, isUnderpaid: false, underpaid: 0 },
      { status: "PAID", billed: 200, paid: 200, isUnderpaid: false, underpaid: 0 },
    ];
    // 60 underpaid + (330 - 0) denied outstanding = 390
    expect(atRisk(claims)).toBe(390);
  });

  it("never counts a negative denied balance", () => {
    const claims: Claim[] = [
      { status: "DENIED", billed: 100, paid: 150, isUnderpaid: false, underpaid: 0 },
    ];
    expect(atRisk(claims)).toBe(0);
  });
});

describe("appeal win rate", () => {
  it("computes won / (won + lost) to one decimal", () => {
    expect(appealWinPct(3, 1)).toBe(75);
    expect(appealWinPct(1, 2)).toBe(33.3);
  });

  it("returns 0 when no appeals are decided", () => {
    expect(appealWinPct(0, 0)).toBe(0);
  });
});

describe("flagged claims", () => {
  it("selects denied or underpaid claims, sorted by underpaid desc", () => {
    const claims: Claim[] = [
      { status: "PAID", billed: 100, paid: 100, isUnderpaid: false, underpaid: 0 },
      { status: "DENIED", billed: 200, paid: 0, isUnderpaid: false, underpaid: 0 },
      { status: "PARTIAL", billed: 300, paid: 200, isUnderpaid: true, underpaid: 100 },
    ];
    const result = flagged(claims);
    expect(result).toHaveLength(2);
    expect(result[0].underpaid).toBe(100);
    expect(result[1].status).toBe("DENIED");
  });
});
