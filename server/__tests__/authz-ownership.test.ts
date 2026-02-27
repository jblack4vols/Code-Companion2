import { describe, it, expect } from "vitest";

/**
 * Pure authorization logic tests for ownership validation and role-based guards.
 * Tests the decision logic without database or HTTP dependencies.
 */

type Role = "OWNER" | "DIRECTOR" | "MARKETER" | "ANALYST" | "FRONT_DESK";

const BYPASS_ROLES: Role[] = ["OWNER", "DIRECTOR"];

/**
 * Determines if a user can mutate a resource they don't own.
 * Mirrors the inline ownership checks in interaction/task/calendar route handlers.
 */
function canMutateResource(userRole: Role, resourceOwnerId: string, sessionUserId: string): boolean {
  if (BYPASS_ROLES.includes(userRole)) return true;
  return resourceOwnerId === sessionUserId;
}

/**
 * Determines if a role can access financial endpoints (collections, ROI).
 * Mirrors requireRole("OWNER", "DIRECTOR", "ANALYST") on financial routes.
 */
const FINANCIAL_ALLOWED_ROLES: Role[] = ["OWNER", "DIRECTOR", "ANALYST"];

function canAccessFinancialData(userRole: Role): boolean {
  if (userRole === "OWNER") return true;
  return FINANCIAL_ALLOWED_ROLES.includes(userRole);
}

// --- Interaction Ownership Tests ---

describe("Interaction Ownership", () => {
  it("allows user to edit their own interaction", () => {
    expect(canMutateResource("MARKETER", "user-1", "user-1")).toBe(true);
  });

  it("blocks user from editing another user's interaction", () => {
    expect(canMutateResource("MARKETER", "user-2", "user-1")).toBe(false);
  });

  it("allows DIRECTOR to edit any user's interaction (bypass)", () => {
    expect(canMutateResource("DIRECTOR", "user-2", "user-1")).toBe(true);
  });

  it("allows OWNER to edit any user's interaction (bypass)", () => {
    expect(canMutateResource("OWNER", "user-2", "user-1")).toBe(true);
  });

  it("blocks ANALYST from editing another user's interaction", () => {
    expect(canMutateResource("ANALYST", "user-2", "user-1")).toBe(false);
  });
});

// --- Task Ownership Tests ---

describe("Task Ownership", () => {
  it("allows user to edit a task assigned to them", () => {
    expect(canMutateResource("MARKETER", "user-1", "user-1")).toBe(true);
  });

  it("blocks user from editing a task assigned to someone else", () => {
    expect(canMutateResource("MARKETER", "user-2", "user-1")).toBe(false);
  });

  it("allows DIRECTOR to edit any task (bypass)", () => {
    expect(canMutateResource("DIRECTOR", "user-2", "user-1")).toBe(true);
  });

  it("allows OWNER to edit any task (bypass)", () => {
    expect(canMutateResource("OWNER", "user-2", "user-1")).toBe(true);
  });

  it("blocks FRONT_DESK from editing another user's task", () => {
    expect(canMutateResource("FRONT_DESK", "user-2", "user-1")).toBe(false);
  });
});

// --- Calendar Event Ownership Tests ---

describe("Calendar Event Ownership", () => {
  it("allows organizer to edit their own event", () => {
    expect(canMutateResource("MARKETER", "user-1", "user-1")).toBe(true);
  });

  it("blocks non-organizer from editing another's event", () => {
    expect(canMutateResource("MARKETER", "user-2", "user-1")).toBe(false);
  });

  it("allows DIRECTOR to edit any event (bypass)", () => {
    expect(canMutateResource("DIRECTOR", "user-2", "user-1")).toBe(true);
  });

  it("allows OWNER to delete any event (bypass)", () => {
    expect(canMutateResource("OWNER", "user-2", "user-1")).toBe(true);
  });
});

// --- Financial Data Access Tests ---

describe("Financial Endpoint Access", () => {
  it("blocks FRONT_DESK from accessing collections", () => {
    expect(canAccessFinancialData("FRONT_DESK")).toBe(false);
  });

  it("blocks MARKETER from accessing collections", () => {
    expect(canAccessFinancialData("MARKETER")).toBe(false);
  });

  it("allows ANALYST to access collections", () => {
    expect(canAccessFinancialData("ANALYST")).toBe(true);
  });

  it("allows DIRECTOR to access collections", () => {
    expect(canAccessFinancialData("DIRECTOR")).toBe(true);
  });

  it("allows OWNER to access collections", () => {
    expect(canAccessFinancialData("OWNER")).toBe(true);
  });
});

// --- Edge Cases ---

describe("Ownership Edge Cases", () => {
  it("OWNER always bypasses regardless of resource owner", () => {
    const otherUsers = ["user-a", "user-b", "user-c"];
    for (const owner of otherUsers) {
      expect(canMutateResource("OWNER", owner, "admin-user")).toBe(true);
    }
  });

  it("identity match works even when role has no bypass", () => {
    expect(canMutateResource("FRONT_DESK", "user-1", "user-1")).toBe(true);
    expect(canMutateResource("ANALYST", "user-1", "user-1")).toBe(true);
  });
});
