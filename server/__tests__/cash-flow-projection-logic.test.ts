import { describe, it, expect } from "vitest";

/**
 * Cash-flow projection math (routes/cash-flow.ts), previously untested (R2-7).
 * Mirrors the route's weekStart + inline projected-week arithmetic (reimplemented
 * so the test stays DB-free — importing the route pulls in ./db). Locks:
 *   scaledVisits = round(visits * visitScale)
 *   rev = scaledVisits * rpv;  labor = rev * laborPct
 *   totalExp = labor + (rent + supplies + other) * visitScale
 *   netCash = rev - totalExp;  cumulativeNet = running sum
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

function weekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

describe("weekStart (Monday of the ISO week)", () => {
  it("snaps a midweek day back to Monday", () => {
    // 2026-01-07 is a Wednesday -> Monday 2026-01-05
    expect(weekStart(new Date("2026-01-07T12:00:00Z"))).toBe("2026-01-05");
  });
  it("snaps Sunday back to the prior Monday (wraps the month)", () => {
    // 2026-01-04 is a Sunday -> Monday 2025-12-29
    expect(weekStart(new Date("2026-01-04T12:00:00Z"))).toBe("2025-12-29");
  });
  it("returns the same day when given a Monday", () => {
    expect(weekStart(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });
});

interface Scenario {
  weeklyVisits: number; rpv: number; laborPct: number;
  weeklyRent: number; weeklySupplies: number; weeklyOther: number;
}
function projectWeek(s: Scenario, visitScale: number) {
  const scaledVisits = Math.round(s.weeklyVisits * visitScale);
  const rev = scaledVisits * s.rpv;
  const labor = rev * s.laborPct;
  const totalExp = labor + s.weeklyRent * visitScale + s.weeklySupplies * visitScale + s.weeklyOther * visitScale;
  return {
    totalVisits: scaledVisits,
    grossRevenue: round2(rev),
    laborCost: round2(labor),
    totalExpenses: round2(totalExp),
    netCash: round2(rev - totalExp),
  };
}

describe("projected week math", () => {
  const scenario: Scenario = {
    weeklyVisits: 400, rpv: 95, laborPct: 0.6,
    weeklyRent: 5000, weeklySupplies: 1000, weeklyOther: 2000,
  };

  it("computes revenue, labor and net at full (all-location) scale", () => {
    const w = projectWeek(scenario, 1);
    expect(w.totalVisits).toBe(400);
    expect(w.grossRevenue).toBe(38000); // 400 * 95
    expect(w.laborCost).toBe(22800); // 38000 * 0.6
    expect(w.totalExpenses).toBe(30800); // 22800 + 8000 fixed
    expect(w.netCash).toBe(7200); // 38000 - 30800
  });

  it("scales visits and fixed costs by location share", () => {
    const w = projectWeek(scenario, 0.25);
    expect(w.totalVisits).toBe(100); // round(400 * 0.25)
    expect(w.grossRevenue).toBe(9500); // 100 * 95
    expect(w.totalExpenses).toBe(7700); // 5700 labor + 2000 scaled fixed
    expect(w.netCash).toBe(1800);
  });

  it("accumulates cumulative net across weeks", () => {
    const weeks = [{ netCash: 7200 }, { netCash: 1800 }, { netCash: -500 }];
    let cum = 0;
    const cumulative = weeks.map(w => (cum = round2(cum + w.netCash)));
    expect(cumulative).toEqual([7200, 9000, 8500]);
  });
});
