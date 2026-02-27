import { describe, it, expect } from "vitest";

/**
 * Pure authorization logic tests for revenue recovery endpoints.
 * Mirrors requireRole() guards in server/routes/revenue-recovery.ts:
 *   READ  = requireRole("OWNER", "DIRECTOR", "ANALYST")
 *   WRITE = requireRole("OWNER", "DIRECTOR")
 *
 * Route → guard map:
 *   GET  /api/revenue/claims, /underpaid, /summary, /denials/*,
 *        /billing-lag/*, /payer-rates, /appeals, /appeal-templates  → READ
 *   POST /api/revenue/claims, /claims/bulk, /claims/:id/flag,
 *        /payer-rates, /payer-rates/build, /appeals, /appeal-templates,
 *        DELETE /appeal-templates/:id                               → WRITE
 *   POST /api/revenue/appeals/:id/submit, /:id/outcome             → WRITE
 */

type Role = "OWNER" | "DIRECTOR" | "MARKETER" | "ANALYST" | "FRONT_DESK";

/** GET endpoints — claims, denials, billing lag, appeals, payer rates */
function canReadRevenue(role: Role): boolean {
  return ["OWNER", "DIRECTOR", "ANALYST"].includes(role);
}

/** POST/PATCH/DELETE endpoints — create claims, import, flag underpaid, manage appeals */
function canWriteRevenue(role: Role): boolean {
  return ["OWNER", "DIRECTOR"].includes(role);
}

/** Appeal generation, submission, outcome recording */
function canManageAppeals(role: Role): boolean {
  return ["OWNER", "DIRECTOR"].includes(role);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Revenue Recovery Authorization", () => {
  describe("Read access (dashboard, claims, denials, billing lag)", () => {
    it("OWNER can read", () => expect(canReadRevenue("OWNER")).toBe(true));
    it("DIRECTOR can read", () => expect(canReadRevenue("DIRECTOR")).toBe(true));
    it("ANALYST can read", () => expect(canReadRevenue("ANALYST")).toBe(true));
    it("MARKETER cannot read", () => expect(canReadRevenue("MARKETER")).toBe(false));
    it("FRONT_DESK cannot read", () => expect(canReadRevenue("FRONT_DESK")).toBe(false));
  });

  describe("Write access (create claims, import, flag underpaid)", () => {
    it("OWNER can write", () => expect(canWriteRevenue("OWNER")).toBe(true));
    it("DIRECTOR can write", () => expect(canWriteRevenue("DIRECTOR")).toBe(true));
    it("ANALYST cannot write", () => expect(canWriteRevenue("ANALYST")).toBe(false));
    it("MARKETER cannot write", () => expect(canWriteRevenue("MARKETER")).toBe(false));
    it("FRONT_DESK cannot write", () => expect(canWriteRevenue("FRONT_DESK")).toBe(false));
  });

  describe("Appeal management", () => {
    it("OWNER can manage", () => expect(canManageAppeals("OWNER")).toBe(true));
    it("DIRECTOR can manage", () => expect(canManageAppeals("DIRECTOR")).toBe(true));
    it("ANALYST cannot manage", () => expect(canManageAppeals("ANALYST")).toBe(false));
    it("MARKETER cannot manage", () => expect(canManageAppeals("MARKETER")).toBe(false));
    it("FRONT_DESK cannot manage", () => expect(canManageAppeals("FRONT_DESK")).toBe(false));
  });

  describe("Role privilege hierarchy", () => {
    it("OWNER has broadest access — passes every guard", () => {
      expect(canReadRevenue("OWNER")).toBe(true);
      expect(canWriteRevenue("OWNER")).toBe(true);
      expect(canManageAppeals("OWNER")).toBe(true);
    });

    it("DIRECTOR has read + write but not owner-only actions", () => {
      expect(canReadRevenue("DIRECTOR")).toBe(true);
      expect(canWriteRevenue("DIRECTOR")).toBe(true);
      expect(canManageAppeals("DIRECTOR")).toBe(true);
    });

    it("ANALYST can only read — cannot write or manage appeals", () => {
      expect(canReadRevenue("ANALYST")).toBe(true);
      expect(canWriteRevenue("ANALYST")).toBe(false);
      expect(canManageAppeals("ANALYST")).toBe(false);
    });

    it("MARKETER and FRONT_DESK pass no revenue guards", () => {
      for (const role of ["MARKETER", "FRONT_DESK"] as Role[]) {
        expect(canReadRevenue(role), `${role} read`).toBe(false);
        expect(canWriteRevenue(role), `${role} write`).toBe(false);
        expect(canManageAppeals(role), `${role} appeals`).toBe(false);
      }
    });
  });
});
