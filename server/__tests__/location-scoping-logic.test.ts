import { describe, it, expect } from "vitest";

/**
 * Pure location-scoping rules used by the revenue + front-desk read routes
 * (R2-2 / R2-3). Mirrors the decisions wired into routes/revenue-recovery.ts
 * and routes/frontdesk.ts without hitting the DB.
 *
 * getUserLocationScope() returns:
 *   null   -> OWNER/DIRECTOR, unscoped (see everything)
 *   []     -> scoped user with no location assignments (see nothing location-bound)
 *   [ids]  -> scoped user limited to those locations
 */

type Scope = string[] | null;

// Claim/aggregate rows: visible when unscoped or the row's location is in scope.
function claimVisible(scope: Scope, claimLocationId: string | null): boolean {
  if (scope === null) return true;
  if (!claimLocationId) return false;
  return scope.includes(claimLocationId);
}

// Front-desk request: scoped users also see unrouted intakes (no location preference).
function requestVisible(scope: Scope, locationPreference: string | null): boolean {
  if (scope === null) return true;
  if (locationPreference === null) return true;
  return scope.includes(locationPreference);
}

describe("claim/revenue visibility by scope", () => {
  it("OWNER/DIRECTOR (null scope) see every claim", () => {
    expect(claimVisible(null, "loc1")).toBe(true);
    expect(claimVisible(null, null)).toBe(true);
  });

  it("scoped analyst sees only in-scope claims", () => {
    expect(claimVisible(["loc1", "loc2"], "loc1")).toBe(true);
    expect(claimVisible(["loc1", "loc2"], "loc3")).toBe(false);
  });

  it("scoped analyst cannot see a claim with no location", () => {
    expect(claimVisible(["loc1"], null)).toBe(false);
  });

  it("empty scope sees nothing", () => {
    expect(claimVisible([], "loc1")).toBe(false);
    expect(claimVisible([], null)).toBe(false);
  });
});

describe("front-desk request visibility by scope", () => {
  it("OWNER/DIRECTOR see every request", () => {
    expect(requestVisible(null, "loc1")).toBe(true);
    expect(requestVisible(null, null)).toBe(true);
  });

  it("scoped front-desk sees in-scope and unrouted requests, not other locations", () => {
    expect(requestVisible(["loc1"], "loc1")).toBe(true); // their location
    expect(requestVisible(["loc1"], null)).toBe(true); // unrouted intake
    expect(requestVisible(["loc1"], "loc2")).toBe(false); // another clinic
  });

  it("front-desk with no assignments still sees unrouted intakes only", () => {
    expect(requestVisible([], null)).toBe(true);
    expect(requestVisible([], "loc1")).toBe(false);
  });
});
