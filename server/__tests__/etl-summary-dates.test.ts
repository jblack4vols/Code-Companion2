import { describe, it, expect } from "vitest";

/**
 * Month helpers used by the nightly ETL rollups — previously untested (R2-7).
 * Mirrors the exported logic in etl-summary-generation.ts (reimplemented here
 * so the test stays DB-free, matching the repo's pure-logic test convention —
 * importing that module pulls in ./db which requires DATABASE_URL).
 */
function getMonthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function getMonthsBetween(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}
function getNextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

describe("getMonthStart", () => {
  it("returns the first of the month as YYYY-MM-01", () => {
    expect(getMonthStart(new Date(2026, 0, 15))).toBe("2026-01-01");
    expect(getMonthStart(new Date(2026, 11, 31))).toBe("2026-12-01");
  });
  it("zero-pads single-digit months", () => {
    expect(getMonthStart(new Date(2026, 8, 3))).toBe("2026-09-01");
  });
});

describe("getMonthsBetween", () => {
  it("lists inclusive months within a year", () => {
    expect(getMonthsBetween("2026-01-01", "2026-03-01")).toEqual([
      "2026-01-01", "2026-02-01", "2026-03-01",
    ]);
  });
  it("crosses a year boundary", () => {
    expect(getMonthsBetween("2025-11-01", "2026-02-01")).toEqual([
      "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01",
    ]);
  });
  it("returns a single month when start equals end", () => {
    expect(getMonthsBetween("2026-05-01", "2026-05-01")).toEqual(["2026-05-01"]);
  });
  it("returns empty when start is after end", () => {
    expect(getMonthsBetween("2026-05-01", "2026-04-01")).toEqual([]);
  });
});

describe("getNextMonth", () => {
  it("advances within a year", () => {
    expect(getNextMonth("2026-01-01")).toBe("2026-02-01");
  });
  it("rolls December into next January", () => {
    expect(getNextMonth("2026-12-01")).toBe("2027-01-01");
  });
});
