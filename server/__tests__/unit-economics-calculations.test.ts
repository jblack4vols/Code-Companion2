import { describe, it, expect } from "vitest";

/**
 * Pure financial calculation tests.
 * Mirrors the SQL math in getUnitEconomicsDashboard() and the inline
 * trend-row mapping in getUnitEconomicsLocationDetail() from
 * server/storage-unit-economics.ts.
 *
 * All functions use the same rounding strategy as the SQL/JS source:
 *   ROUND(x, 2)  → Math.round(x * 100) / 100
 *   ROUND(x, 1)  → Math.round(x * 1000) / 10
 */

// ---------------------------------------------------------------------------
// Revenue per visit — mirrors SQL ROUND(SUM(gross_revenue)/SUM(total_visits), 2)
// ---------------------------------------------------------------------------
function revenuePerVisit(totalRevenue: number, totalVisits: number): number {
  if (totalVisits === 0) return 0;
  return Math.round((totalRevenue / totalVisits) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Cost per visit — mirrors SQL ROUND((labor+rent+supplies+other)/visits, 2)
// ---------------------------------------------------------------------------
function costPerVisit(
  labor: number, rent: number, supplies: number, other: number, totalVisits: number
): number {
  if (totalVisits === 0) return 0;
  const totalCost = labor + rent + supplies + other;
  return Math.round((totalCost / totalVisits) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Labor percent — mirrors SQL ROUND(labor_cost/gross_revenue * 100, 1)
// ---------------------------------------------------------------------------
function laborPercent(laborCost: number, grossRevenue: number): number {
  if (grossRevenue === 0) return 0;
  return Math.round((laborCost / grossRevenue) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Net margin percent — mirrors SQL ROUND(net_contribution/gross_revenue * 100, 1)
// ---------------------------------------------------------------------------
function netMarginPercent(netContribution: number, grossRevenue: number): number {
  if (grossRevenue === 0) return 0;
  return Math.round((netContribution / grossRevenue) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Net contribution — mirrors: gross_revenue - labor - rent - supplies - other
// ---------------------------------------------------------------------------
function netContribution(
  grossRevenue: number, labor: number, rent: number, supplies: number, other: number
): number {
  return grossRevenue - labor - rent - supplies - other;
}

// ---------------------------------------------------------------------------
// Target attainment — mirrors: Math.round((rev / target) * 1000) / 10
// Used in getProviderProductivityLeaderboard()
// ---------------------------------------------------------------------------
function targetAttainment(actual: number, target: number): number {
  if (target === 0) return 0;
  return Math.round((actual / target) * 1000) / 10;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("revenuePerVisit", () => {
  it("computes correctly for round numbers", () => {
    expect(revenuePerVisit(10500, 100)).toBe(105);
  });
  it("returns 0 when visit count is zero", () => {
    expect(revenuePerVisit(10000, 0)).toBe(0);
  });
  it("rounds to 2 decimal places", () => {
    expect(revenuePerVisit(10000, 3)).toBe(3333.33);
  });
  it("handles fractional revenue correctly", () => {
    expect(revenuePerVisit(1000, 6)).toBe(166.67);
  });
  it("returns 0 when both revenue and visits are zero", () => {
    expect(revenuePerVisit(0, 0)).toBe(0);
  });
  it("handles single visit", () => {
    expect(revenuePerVisit(95.5, 1)).toBe(95.5);
  });
});

describe("costPerVisit", () => {
  it("sums all four cost categories then divides by visits", () => {
    // 5000 + 2000 + 500 + 300 = 7800 / 100 = 78
    expect(costPerVisit(5000, 2000, 500, 300, 100)).toBe(78);
  });
  it("returns 0 when visit count is zero", () => {
    expect(costPerVisit(5000, 2000, 500, 300, 0)).toBe(0);
  });
  it("handles zero costs", () => {
    expect(costPerVisit(0, 0, 0, 0, 50)).toBe(0);
  });
  it("rounds to 2 decimal places", () => {
    // 100 / 3 = 33.333... → 33.33
    expect(costPerVisit(100, 0, 0, 0, 3)).toBe(33.33);
  });
  it("handles large cost values", () => {
    expect(costPerVisit(50000, 12000, 3000, 5000, 200)).toBe(350);
  });
});

describe("laborPercent", () => {
  it("computes correct percentage", () => {
    expect(laborPercent(48000, 100000)).toBe(48);
  });
  it("returns 0 when gross revenue is zero", () => {
    expect(laborPercent(5000, 0)).toBe(0);
  });
  it("rounds to 1 decimal place", () => {
    expect(laborPercent(333, 1000)).toBe(33.3);
  });
  it("handles 100% labor (no margin)", () => {
    expect(laborPercent(100000, 100000)).toBe(100);
  });
  it("handles labor exceeding revenue (over 100%)", () => {
    expect(laborPercent(120000, 100000)).toBe(120);
  });
  it("handles zero labor cost", () => {
    expect(laborPercent(0, 80000)).toBe(0);
  });
});

describe("netMarginPercent", () => {
  it("computes positive margin correctly", () => {
    expect(netMarginPercent(22000, 100000)).toBe(22);
  });
  it("computes negative margin correctly", () => {
    expect(netMarginPercent(-5000, 100000)).toBe(-5);
  });
  it("returns 0 when gross revenue is zero", () => {
    expect(netMarginPercent(0, 0)).toBe(0);
  });
  it("rounds to 1 decimal place", () => {
    // 333 / 1000 * 100 = 33.3
    expect(netMarginPercent(333, 1000)).toBe(33.3);
  });
  it("handles 100% margin edge case", () => {
    expect(netMarginPercent(50000, 50000)).toBe(100);
  });
});

describe("netContribution", () => {
  it("subtracts all cost categories from gross revenue", () => {
    expect(netContribution(100000, 48000, 12000, 3000, 5000)).toBe(32000);
  });
  it("returns negative value when costs exceed revenue", () => {
    expect(netContribution(50000, 30000, 15000, 5000, 5000)).toBe(-5000);
  });
  it("returns gross revenue when all costs are zero", () => {
    expect(netContribution(80000, 0, 0, 0, 0)).toBe(80000);
  });
  it("returns zero when revenue equals total costs", () => {
    expect(netContribution(60000, 30000, 15000, 10000, 5000)).toBe(0);
  });
  it("handles zero revenue with no costs", () => {
    expect(netContribution(0, 0, 0, 0, 0)).toBe(0);
  });
});

describe("targetAttainment", () => {
  it("returns 100 when actual equals target", () => {
    expect(targetAttainment(7500, 7500)).toBe(100);
  });
  it("returns above 100 when exceeding target", () => {
    expect(targetAttainment(9000, 7500)).toBe(120);
  });
  it("returns below 100 when under target", () => {
    expect(targetAttainment(5700, 7500)).toBe(76);
  });
  it("returns 0 when target is zero", () => {
    expect(targetAttainment(5000, 0)).toBe(0);
  });
  it("returns 0 when actual is zero", () => {
    expect(targetAttainment(0, 7500)).toBe(0);
  });
  it("rounds to 1 decimal place", () => {
    // 5000 / 7500 * 100 = 66.666... → 66.7
    expect(targetAttainment(5000, 7500)).toBe(66.7);
  });
  it("handles very high attainment", () => {
    expect(targetAttainment(15000, 7500)).toBe(200);
  });
});
