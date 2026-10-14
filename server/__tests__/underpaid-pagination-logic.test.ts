import { describe, it, expect } from "vitest";

/**
 * Pure pagination clamp for getUnderpaidClaims (R2-10): default 200 rows,
 * hard cap 500, page floored at 1. Mirrors the bounds in
 * storage-revenue-recovery.ts so the /api/revenue/underpaid payload stays bounded.
 */
function bounds(page?: number, pageSize?: number): { pageSize: number; offset: number } {
  const ps = Math.min(Math.max(pageSize ?? 200, 1), 500);
  const offset = (Math.max(page ?? 1, 1) - 1) * ps;
  return { pageSize: ps, offset };
}

describe("underpaid pagination clamp", () => {
  it("defaults to 200 rows, offset 0", () => {
    expect(bounds()).toEqual({ pageSize: 200, offset: 0 });
  });
  it("caps pageSize at 500", () => {
    expect(bounds(1, 10000).pageSize).toBe(500);
  });
  it("floors pageSize at 1 and page at 1", () => {
    expect(bounds(0, 0)).toEqual({ pageSize: 1, offset: 0 });
    expect(bounds(-5, 50).offset).toBe(0);
  });
  it("computes offset from page and size", () => {
    expect(bounds(3, 50)).toEqual({ pageSize: 50, offset: 100 });
  });
});
