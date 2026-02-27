import { describe, it, expect } from "vitest";

/**
 * Pure threshold-comparison logic tests.
 * Mirrors the triggered-check in evaluateAlerts() from unit-economics-alert-engine.ts.
 * The engine stores comparison as "lt" | "gt" per AlertRule — not derived from alert type name.
 */

type Comparison = "lt" | "gt";
type AlertType = "LOW_REVENUE_PER_VISIT" | "HIGH_COST_PER_VISIT" | "HIGH_LABOR_PERCENT" | "LOW_PROVIDER_REVENUE";

/** Mirrors: `const triggered = rule.comparison === "lt" ? actual < threshold : actual > threshold` */
function checkThreshold(comparison: Comparison, actualValue: number, thresholdValue: number): boolean {
  return comparison === "lt" ? actualValue < thresholdValue : actualValue > thresholdValue;
}

/** Maps alert types to their comparison direction — mirrors LOCATION_ALERT_RULES defaults */
const ALERT_RULE_COMPARISON: Record<AlertType, Comparison> = {
  LOW_REVENUE_PER_VISIT: "lt",
  HIGH_COST_PER_VISIT: "gt",
  HIGH_LABOR_PERCENT: "gt",
  LOW_PROVIDER_REVENUE: "lt",
};

/** Convenience wrapper used in tests to keep intent readable */
function alertTriggered(alertType: AlertType, actualValue: number, thresholdValue: number): boolean {
  return checkThreshold(ALERT_RULE_COMPARISON[alertType], actualValue, thresholdValue);
}

describe("Alert Threshold Logic", () => {
  describe("LOW_REVENUE_PER_VISIT (comparison: lt, default threshold: 95)", () => {
    it("triggers when revenue/visit below threshold", () => {
      expect(alertTriggered("LOW_REVENUE_PER_VISIT", 85, 95)).toBe(true);
    });
    it("does not trigger when revenue/visit equals threshold", () => {
      expect(alertTriggered("LOW_REVENUE_PER_VISIT", 95, 95)).toBe(false);
    });
    it("does not trigger when revenue/visit above threshold", () => {
      expect(alertTriggered("LOW_REVENUE_PER_VISIT", 105, 95)).toBe(false);
    });
  });

  describe("HIGH_COST_PER_VISIT (comparison: gt, default threshold: 92)", () => {
    it("triggers when cost/visit above threshold", () => {
      expect(alertTriggered("HIGH_COST_PER_VISIT", 95, 92)).toBe(true);
    });
    it("does not trigger when cost/visit equals threshold", () => {
      expect(alertTriggered("HIGH_COST_PER_VISIT", 92, 92)).toBe(false);
    });
    it("does not trigger when cost/visit below threshold", () => {
      expect(alertTriggered("HIGH_COST_PER_VISIT", 78, 92)).toBe(false);
    });
  });

  describe("HIGH_LABOR_PERCENT (comparison: gt, default threshold: 57.5)", () => {
    it("triggers when labor % above threshold", () => {
      expect(alertTriggered("HIGH_LABOR_PERCENT", 62, 57.5)).toBe(true);
    });
    it("does not trigger at threshold boundary", () => {
      expect(alertTriggered("HIGH_LABOR_PERCENT", 57.5, 57.5)).toBe(false);
    });
    it("does not trigger when below threshold", () => {
      expect(alertTriggered("HIGH_LABOR_PERCENT", 48, 57.5)).toBe(false);
    });
  });

  describe("LOW_PROVIDER_REVENUE (comparison: lt, default threshold: 5700)", () => {
    it("triggers when provider revenue below threshold", () => {
      expect(alertTriggered("LOW_PROVIDER_REVENUE", 4800, 5700)).toBe(true);
    });
    it("does not trigger when above threshold", () => {
      expect(alertTriggered("LOW_PROVIDER_REVENUE", 7500, 5700)).toBe(false);
    });
    it("does not trigger when exactly at threshold", () => {
      expect(alertTriggered("LOW_PROVIDER_REVENUE", 5700, 5700)).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("handles zero actual value for lt alert (triggers)", () => {
      expect(checkThreshold("lt", 0, 95)).toBe(true);
    });
    it("handles zero actual value for gt alert (does not trigger)", () => {
      expect(checkThreshold("gt", 0, 92)).toBe(false);
    });
    it("handles negative actual for lt alert (triggers)", () => {
      expect(checkThreshold("lt", -10, 95)).toBe(true);
    });
    it("handles very large actual for gt alert (triggers)", () => {
      expect(checkThreshold("gt", 999999, 92)).toBe(true);
    });
    it("handles zero threshold for lt alert (does not trigger when actual is zero)", () => {
      expect(checkThreshold("lt", 0, 0)).toBe(false);
    });
    it("handles zero threshold for gt alert (triggers when actual is positive)", () => {
      expect(checkThreshold("gt", 1, 0)).toBe(true);
    });
  });
});
