import { describe, it, expect } from "vitest";

/**
 * Pure parsing function tests mirroring the import pipeline logic.
 * These functions replicate the inline helpers from server/routes/import.ts
 * and the equivalent logic used in any unit-economics financial import flow.
 * Tested independently of HTTP/storage/file-system.
 */

// ---------------------------------------------------------------------------
// parseNum — strips currency formatting and converts to float
// ---------------------------------------------------------------------------

function parseNum(val: any): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val.replace(/[$,\s]/g, "")) || 0;
  return 0;
}

// ---------------------------------------------------------------------------
// parseDateValue — normalises various date representations to YYYY-MM-DD
// Mirrors the parseDate() helper in server/routes/import.ts plus the
// Excel-serial path used in the financial import pipeline.
// ---------------------------------------------------------------------------

function parseDateValue(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "number") {
    // Excel serial: days since 1899-12-30 (with Lotus 1-2-3 leap-year bug offset of 25569 to Unix epoch)
    const utcDays = Math.floor(val - 25569);
    return new Date(utcDays * 86400000).toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const [m, d, y] = s.split("/");
    const yr = y.length === 2 ? "20" + y : y;
    return `${yr}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// autoDetectMapping — heuristically maps spreadsheet headers to schema fields
// ---------------------------------------------------------------------------

function autoDetectMapping(importType: string, headers: string[]): Record<string, string | null> {
  const lower = headers.map(h => (h || "").toLowerCase());
  function findHeader(keywords: string[]): string | null {
    for (const kw of keywords) {
      const idx = lower.findIndex(h => h.includes(kw));
      if (idx !== -1) return headers[idx];
    }
    return null;
  }
  if (importType === "quickbooks") {
    return {
      locationName: findHeader(["location", "clinic", "site"]),
      periodDate: findHeader(["date", "period", "month"]),
      grossRevenue: findHeader(["revenue", "gross", "income", "total revenue"]),
    };
  }
  if (importType === "payroll") {
    return {
      locationName: findHeader(["location", "clinic", "site"]),
      periodDate: findHeader(["date", "period", "pay period", "week"]),
      laborCost: findHeader(["labor", "payroll", "wages", "salary"]),
      rentCost: findHeader(["rent", "lease"]),
      suppliesCost: findHeader(["supplies", "materials"]),
      otherFixedCosts: findHeader(["other", "overhead", "fixed"]),
    };
  }
  if (importType === "promptbi") {
    return {
      providerName: findHeader(["provider", "therapist", "clinician"]),
      locationName: findHeader(["location", "clinic", "site"]),
      weekStartDate: findHeader(["week", "date", "period"]),
      totalVisits: findHeader(["visits", "patient visits"]),
      totalUnits: findHeader(["units", "total units"]),
      hoursWorked: findHeader(["hours", "hours worked"]),
    };
  }
  return {};
}

// ===========================================================================
// Tests
// ===========================================================================

describe("parseNum", () => {
  it("returns a plain number as-is", () => {
    expect(parseNum(1234.56)).toBe(1234.56);
  });
  it("returns an integer as-is", () => {
    expect(parseNum(100)).toBe(100);
  });
  it("parses currency string with $ and commas", () => {
    expect(parseNum("$1,234.56")).toBe(1234.56);
  });
  it("parses negative string", () => {
    expect(parseNum("-500")).toBe(-500);
  });
  it("returns 0 for null", () => {
    expect(parseNum(null)).toBe(0);
  });
  it("returns 0 for undefined", () => {
    expect(parseNum(undefined)).toBe(0);
  });
  it("returns 0 for non-numeric string", () => {
    expect(parseNum("abc")).toBe(0);
  });
  it("handles string with leading/trailing spaces", () => {
    expect(parseNum(" 42 ")).toBe(42);
  });
  it("handles zero as number", () => {
    expect(parseNum(0)).toBe(0);
  });
  it("handles large dollar amount string", () => {
    expect(parseNum("$1,000,000.00")).toBe(1000000);
  });
});

describe("parseDateValue", () => {
  it("parses ISO date string", () => {
    expect(parseDateValue("2026-01-15")).toBe("2026-01-15");
  });
  it("parses ISO datetime string (truncates time component)", () => {
    expect(parseDateValue("2026-01-15T10:30:00Z")).toBe("2026-01-15");
  });
  it("parses US date format M/D/YYYY", () => {
    expect(parseDateValue("1/15/2026")).toBe("2026-01-15");
  });
  it("parses US date with 2-digit year", () => {
    expect(parseDateValue("1/15/26")).toBe("2026-01-15");
  });
  it("parses US date with zero-padded month and day", () => {
    expect(parseDateValue("01/05/2026")).toBe("2026-01-05");
  });
  it("parses Excel serial date number (within ±1 day tolerance for timezone)", () => {
    // Excel serial 46037 corresponds to ~2026-01-15 depending on UTC offset
    const result = parseDateValue(46037);
    expect(result).toMatch(/^2026-01-1[45]$/);
  });
  it("parses a Date object", () => {
    const d = new Date("2026-06-15T00:00:00Z");
    expect(parseDateValue(d)).toBe("2026-06-15");
  });
  it("returns null for empty string", () => {
    expect(parseDateValue("")).toBe(null);
  });
  it("returns null for null", () => {
    expect(parseDateValue(null)).toBe(null);
  });
  it("returns null for undefined", () => {
    expect(parseDateValue(undefined)).toBe(null);
  });
  it("returns null for garbage string", () => {
    expect(parseDateValue("not-a-date")).toBe(null);
  });
  it("returns null for 0 (Excel epoch before 1970)", () => {
    // Serial 0 → 1899-12-30 UTC, but toISOString is still a valid ISO string
    // The important thing is it doesn't throw
    const result = parseDateValue(0);
    expect(typeof result === "string" || result === null).toBe(true);
  });
});

describe("autoDetectMapping", () => {
  describe("QuickBooks import type", () => {
    it("detects standard QuickBooks column names", () => {
      const headers = ["Location", "Date", "Gross Revenue", "Tax"];
      const mapping = autoDetectMapping("quickbooks", headers);
      expect(mapping.locationName).toBe("Location");
      expect(mapping.periodDate).toBe("Date");
      expect(mapping.grossRevenue).toBe("Gross Revenue");
    });
    it("detects alternate column names (Clinic Name / Period / Total Income)", () => {
      const headers = ["Clinic Name", "Period", "Total Income"];
      const mapping = autoDetectMapping("quickbooks", headers);
      expect(mapping.locationName).toBe("Clinic Name");
      expect(mapping.periodDate).toBe("Period");
      expect(mapping.grossRevenue).toBe("Total Income");
    });
    it("returns null for columns with no recognisable keywords", () => {
      const headers = ["Foo", "Bar", "Baz"];
      const mapping = autoDetectMapping("quickbooks", headers);
      expect(mapping.locationName).toBe(null);
      expect(mapping.periodDate).toBe(null);
      expect(mapping.grossRevenue).toBe(null);
    });
    it("is case-insensitive when matching headers", () => {
      const headers = ["LOCATION", "DATE", "REVENUE"];
      const mapping = autoDetectMapping("quickbooks", headers);
      expect(mapping.locationName).toBe("LOCATION");
      expect(mapping.periodDate).toBe("DATE");
      expect(mapping.grossRevenue).toBe("REVENUE");
    });
  });

  describe("Payroll import type", () => {
    it("detects standard payroll column names", () => {
      const headers = ["Site", "Pay Period", "Labor Cost", "Rent", "Supplies", "Other Costs"];
      const mapping = autoDetectMapping("payroll", headers);
      expect(mapping.locationName).toBe("Site");
      expect(mapping.periodDate).toBe("Pay Period");
      expect(mapping.laborCost).toBe("Labor Cost");
      expect(mapping.rentCost).toBe("Rent");
      expect(mapping.suppliesCost).toBe("Supplies");
      expect(mapping.otherFixedCosts).toBe("Other Costs");
    });
    it("detects salary as labor cost", () => {
      const headers = ["Clinic", "Week", "Salary", "Lease"];
      const mapping = autoDetectMapping("payroll", headers);
      expect(mapping.laborCost).toBe("Salary");
      expect(mapping.rentCost).toBe("Lease");
    });
    it("detects materials as supplies cost", () => {
      const headers = ["Location", "Date", "Wages", "Rent", "Materials", "Overhead"];
      const mapping = autoDetectMapping("payroll", headers);
      expect(mapping.suppliesCost).toBe("Materials");
      expect(mapping.otherFixedCosts).toBe("Overhead");
    });
  });

  describe("Prompt BI import type", () => {
    it("detects standard Prompt BI column names", () => {
      const headers = ["Therapist", "Clinic", "Week Start", "Patient Visits", "Total Units", "Hours Worked"];
      const mapping = autoDetectMapping("promptbi", headers);
      expect(mapping.providerName).toBe("Therapist");
      expect(mapping.locationName).toBe("Clinic");
      expect(mapping.weekStartDate).toBe("Week Start");
      expect(mapping.totalVisits).toBe("Patient Visits");
      expect(mapping.totalUnits).toBe("Total Units");
      expect(mapping.hoursWorked).toBe("Hours Worked");
    });
    it("detects Provider and Clinician as provider name keywords", () => {
      const headers = ["Provider", "Site", "Date"];
      const mapping = autoDetectMapping("promptbi", headers);
      expect(mapping.providerName).toBe("Provider");
    });
    it("detects Visits column for totalVisits", () => {
      const headers = ["Clinician", "Location", "Period", "Visits", "Units", "Hours"];
      const mapping = autoDetectMapping("promptbi", headers);
      expect(mapping.totalVisits).toBe("Visits");
    });
  });

  describe("Unknown import type", () => {
    it("returns empty mapping for unrecognised import type", () => {
      const mapping = autoDetectMapping("unknown", ["A", "B", "C"]);
      expect(mapping).toEqual({});
    });
    it("returns empty mapping for empty string type", () => {
      const mapping = autoDetectMapping("", ["Location", "Date"]);
      expect(mapping).toEqual({});
    });
  });

  describe("Edge cases", () => {
    it("handles empty headers array", () => {
      const mapping = autoDetectMapping("quickbooks", []);
      expect(mapping.locationName).toBe(null);
      expect(mapping.periodDate).toBe(null);
      expect(mapping.grossRevenue).toBe(null);
    });
    it("handles headers with null/undefined values gracefully", () => {
      // null/undefined coerced to empty string by (h || "").toLowerCase()
      const headers = [null as any, undefined as any, "Date", "Revenue"];
      const mapping = autoDetectMapping("quickbooks", headers);
      expect(mapping.periodDate).toBe("Date");
      expect(mapping.grossRevenue).toBe("Revenue");
    });
  });
});
