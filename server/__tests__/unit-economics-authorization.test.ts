import { describe, it, expect } from "vitest";

/**
 * Pure authorization logic tests for unit economics endpoints.
 * Mirrors requireRole() guards in server/routes/unit-economics.ts.
 * No database or HTTP dependencies.
 *
 * Route → role map (from unit-economics.ts):
 *   GET  /dashboard, /location/:id, /providers, /forecast, /alerts  → OWNER, DIRECTOR, ANALYST
 *   POST /financials, /alerts/evaluate                               → OWNER, DIRECTOR
 *   POST /alerts/:id/acknowledge                                     → OWNER, DIRECTOR
 *   GET  /targets                                                    → OWNER, DIRECTOR
 *   PATCH /targets                                                   → OWNER only
 */

type Role = "OWNER" | "DIRECTOR" | "MARKETER" | "ANALYST" | "FRONT_DESK";

/** GET /dashboard, /location/:id, /providers, /forecast, /alerts */
function canAccessUnitEconomics(role: Role): boolean {
  return ["OWNER", "DIRECTOR", "ANALYST"].includes(role);
}

/** POST /financials, POST /alerts/evaluate */
function canManageFinancials(role: Role): boolean {
  return ["OWNER", "DIRECTOR"].includes(role);
}

/** PATCH /targets — OWNER only */
function canManageTargets(role: Role): boolean {
  return role === "OWNER";
}

/** POST /alerts/:id/acknowledge */
function canAcknowledgeAlerts(role: Role): boolean {
  return ["OWNER", "DIRECTOR"].includes(role);
}

/** GET /targets */
function canReadTargets(role: Role): boolean {
  return ["OWNER", "DIRECTOR"].includes(role);
}

// ===========================================================================

describe("Unit Economics Authorization", () => {
  describe("Dashboard and read-only endpoints (OWNER | DIRECTOR | ANALYST)", () => {
    it("OWNER can access dashboard", () => expect(canAccessUnitEconomics("OWNER")).toBe(true));
    it("DIRECTOR can access dashboard", () => expect(canAccessUnitEconomics("DIRECTOR")).toBe(true));
    it("ANALYST can access dashboard", () => expect(canAccessUnitEconomics("ANALYST")).toBe(true));
    it("MARKETER cannot access dashboard", () => expect(canAccessUnitEconomics("MARKETER")).toBe(false));
    it("FRONT_DESK cannot access dashboard", () => expect(canAccessUnitEconomics("FRONT_DESK")).toBe(false));
  });

  describe("Financial data management — POST /financials, POST /alerts/evaluate (OWNER | DIRECTOR)", () => {
    it("OWNER can manage financials", () => expect(canManageFinancials("OWNER")).toBe(true));
    it("DIRECTOR can manage financials", () => expect(canManageFinancials("DIRECTOR")).toBe(true));
    it("ANALYST cannot manage financials", () => expect(canManageFinancials("ANALYST")).toBe(false));
    it("MARKETER cannot manage financials", () => expect(canManageFinancials("MARKETER")).toBe(false));
    it("FRONT_DESK cannot manage financials", () => expect(canManageFinancials("FRONT_DESK")).toBe(false));
  });

  describe("Targets write — PATCH /targets (OWNER only)", () => {
    it("OWNER can manage targets", () => expect(canManageTargets("OWNER")).toBe(true));
    it("DIRECTOR cannot write targets", () => expect(canManageTargets("DIRECTOR")).toBe(false));
    it("ANALYST cannot write targets", () => expect(canManageTargets("ANALYST")).toBe(false));
    it("MARKETER cannot write targets", () => expect(canManageTargets("MARKETER")).toBe(false));
    it("FRONT_DESK cannot write targets", () => expect(canManageTargets("FRONT_DESK")).toBe(false));
  });

  describe("Targets read — GET /targets (OWNER | DIRECTOR)", () => {
    it("OWNER can read targets", () => expect(canReadTargets("OWNER")).toBe(true));
    it("DIRECTOR can read targets", () => expect(canReadTargets("DIRECTOR")).toBe(true));
    it("ANALYST cannot read targets", () => expect(canReadTargets("ANALYST")).toBe(false));
    it("MARKETER cannot read targets", () => expect(canReadTargets("MARKETER")).toBe(false));
    it("FRONT_DESK cannot read targets", () => expect(canReadTargets("FRONT_DESK")).toBe(false));
  });

  describe("Alert acknowledgement — POST /alerts/:id/acknowledge (OWNER | DIRECTOR)", () => {
    it("OWNER can acknowledge alerts", () => expect(canAcknowledgeAlerts("OWNER")).toBe(true));
    it("DIRECTOR can acknowledge alerts", () => expect(canAcknowledgeAlerts("DIRECTOR")).toBe(true));
    it("ANALYST cannot acknowledge alerts", () => expect(canAcknowledgeAlerts("ANALYST")).toBe(false));
    it("MARKETER cannot acknowledge alerts", () => expect(canAcknowledgeAlerts("MARKETER")).toBe(false));
    it("FRONT_DESK cannot acknowledge alerts", () => expect(canAcknowledgeAlerts("FRONT_DESK")).toBe(false));
  });

  describe("Role privilege hierarchy", () => {
    const allRoles: Role[] = ["OWNER", "DIRECTOR", "MARKETER", "ANALYST", "FRONT_DESK"];

    it("OWNER has the broadest access — passes every guard", () => {
      expect(canAccessUnitEconomics("OWNER")).toBe(true);
      expect(canManageFinancials("OWNER")).toBe(true);
      expect(canManageTargets("OWNER")).toBe(true);
      expect(canReadTargets("OWNER")).toBe(true);
      expect(canAcknowledgeAlerts("OWNER")).toBe(true);
    });

    it("MARKETER and FRONT_DESK pass no unit-economics guards", () => {
      for (const role of ["MARKETER", "FRONT_DESK"] as Role[]) {
        expect(canAccessUnitEconomics(role), `${role} dashboard`).toBe(false);
        expect(canManageFinancials(role), `${role} financials`).toBe(false);
        expect(canManageTargets(role), `${role} targets write`).toBe(false);
        expect(canReadTargets(role), `${role} targets read`).toBe(false);
        expect(canAcknowledgeAlerts(role), `${role} acknowledge`).toBe(false);
      }
    });

    it("ANALYST can only read — cannot write financials, targets, or acknowledge alerts", () => {
      expect(canAccessUnitEconomics("ANALYST")).toBe(true);
      expect(canManageFinancials("ANALYST")).toBe(false);
      expect(canManageTargets("ANALYST")).toBe(false);
      expect(canReadTargets("ANALYST")).toBe(false);
      expect(canAcknowledgeAlerts("ANALYST")).toBe(false);
    });
  });
});
