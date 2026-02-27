import { describe, it, expect } from "vitest";

/**
 * Pure appeal template logic tests.
 * Mirrors logic in storage-appeal-templates.ts:
 *   - {{PLACEHOLDER}} substitution via renderAppealText()
 *   - matchTemplateForDenialCodes(): specific code match → generic fallback
 *   - appeal win rate percentage calculation
 */

// ---------------------------------------------------------------------------
// Placeholder replacement — mirrors renderAppealText() regex substitution
// ---------------------------------------------------------------------------
function replacePlaceholders(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || match;
  });
}

// ---------------------------------------------------------------------------
// Template matching — mirrors matchTemplateForDenialCodes():
//   1. try specific denialCodePattern match against any code in claim
//   2. fall back to generic template (null pattern)
// ---------------------------------------------------------------------------
function matchTemplate(
  templates: Array<{ denialCodePattern: string | null; templateText: string }>,
  denialCodes: string | null
): { denialCodePattern: string | null; templateText: string } | null {
  if (!templates.length) return null;

  // Try specific match first
  if (denialCodes) {
    const codes = denialCodes.split(",").map(c => c.trim());
    for (const t of templates) {
      if (t.denialCodePattern && codes.some(c => c.includes(t.denialCodePattern!))) {
        return t;
      }
    }
  }

  // Fall back to generic (null pattern)
  return templates.find(t => !t.denialCodePattern) || templates[0];
}

// ---------------------------------------------------------------------------
// Win rate — mirrors getAppealStats(): won / total * 100
// ---------------------------------------------------------------------------
function appealWinRate(won: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((won / total) * 1000) / 10;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Appeal Template Logic", () => {
  describe("replacePlaceholders", () => {
    it("replaces all placeholders", () => {
      const template = "Claim {{CLAIM_NUMBER}} for {{PATIENT_NAME}} on {{DOS}}";
      const result = replacePlaceholders(template, {
        CLAIM_NUMBER: "CLM-001",
        PATIENT_NAME: "John Doe",
        DOS: "2026-01-15",
      });
      expect(result).toBe("Claim CLM-001 for John Doe on 2026-01-15");
    });
    it("preserves unmatched placeholders", () => {
      expect(replacePlaceholders("{{FOO}} {{BAR}}", { FOO: "yes" }))
        .toBe("yes {{BAR}}");
    });
    it("handles empty data", () => {
      expect(replacePlaceholders("{{FOO}}", {})).toBe("{{FOO}}");
    });
    it("handles template with no placeholders", () => {
      expect(replacePlaceholders("plain text", { FOO: "bar" })).toBe("plain text");
    });
  });

  describe("matchTemplate", () => {
    const templates = [
      { denialCodePattern: "CO-50", templateText: "Medical necessity appeal" },
      { denialCodePattern: "CO-4", templateText: "Authorization appeal" },
      { denialCodePattern: null, templateText: "Generic appeal" },
    ];

    it("matches specific denial code", () => {
      expect(matchTemplate(templates, "CO-50")?.templateText).toBe("Medical necessity appeal");
    });
    it("matches from comma-separated codes", () => {
      expect(matchTemplate(templates, "CO-4,PR-1")?.templateText).toBe("Authorization appeal");
    });
    it("falls back to generic", () => {
      expect(matchTemplate(templates, "CO-999")?.templateText).toBe("Generic appeal");
    });
    it("uses generic for null denial codes", () => {
      expect(matchTemplate(templates, null)?.templateText).toBe("Generic appeal");
    });
    it("returns null for empty templates", () => {
      expect(matchTemplate([], "CO-50")).toBe(null);
    });
  });

  describe("appealWinRate", () => {
    it("calculates percentage", () => expect(appealWinRate(7, 10)).toBe(70));
    it("zero total", () => expect(appealWinRate(0, 0)).toBe(0));
    it("all won", () => expect(appealWinRate(5, 5)).toBe(100));
    it("none won", () => expect(appealWinRate(0, 10)).toBe(0));
    it("rounds to 1 decimal", () => expect(appealWinRate(1, 3)).toBe(33.3));
  });
});
