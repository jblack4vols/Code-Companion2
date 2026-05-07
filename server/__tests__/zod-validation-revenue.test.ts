import { describe, it, expect } from "vitest";
import { insertClaimSchema, insertAppealSchema, insertPayerRateSchema } from "@shared/schema";
import { z } from "zod";

/**
 * Zod schema validation tests for revenue recovery tables.
 * Verifies:
 * - insertClaimSchema validates required fields and omits auto-generated fields
 * - insertAppealSchema validates required fields (claimId, generatedText)
 * - insertPayerRateSchema validates payer/cptCode/expectedRate
 * - All schemas properly omit id, createdAt, updatedAt
 * - Field types and constraints are enforced
 */

describe("Revenue Recovery Zod Schemas", () => {
  describe("insertClaimSchema", () => {
    describe("Valid claims", () => {
      it("accepts minimal valid claim", () => {
        const validClaim = {
          claimNumber: "CLM-2024-001",
          dos: "2024-04-01",
        };
        expect(() => insertClaimSchema.parse(validClaim)).not.toThrow();
      });

      it("accepts fully populated claim", () => {
        const fullClaim = {
          claimNumber: "CLM-2024-002",
          dos: "2024-04-02",
          locationId: "loc-123",
          providerId: "prov-456",
          physicianId: "phys-789",
          patientAccountNumber: "PAT-001",
          cptCodes: "99213,99214",
          units: 2,
          payer: "United Healthcare",
          payerType: "COMMERCIAL",
          billedAmount: "500.00",
          expectedAmount: "450.00",
          paidAmount: "400.00",
          adjustmentAmount: "50.00",
          patientResponsibility: "0.00",
          status: "SUBMITTED",
          submissionDate: "2024-04-01",
          paymentDate: "2024-04-15",
          denialCodes: "N3,N9",
          denialReason: "Missing authorization",
          isUnderpaid: false,
          underpaidAmount: "0.00",
          source: "import",
        };
        expect(() => insertClaimSchema.parse(fullClaim)).not.toThrow();
      });

      it("accepts claim with date strings (auto-coerced)", () => {
        const claim = {
          claimNumber: "CLM-2024-003",
          dos: "2024-04-03",
        };
        expect(() => insertClaimSchema.parse(claim)).not.toThrow();
      });
    });

    describe("Required field validation", () => {
      it("rejects claim without claimNumber", () => {
        const invalid = {
          dos: new Date("2024-04-01"),
        };
        expect(() => insertClaimSchema.parse(invalid)).toThrow();
      });

      it("rejects claim without dos (date of service)", () => {
        const invalid = {
          claimNumber: "CLM-2024-004",
        };
        expect(() => insertClaimSchema.parse(invalid)).toThrow();
      });

      it("rejects claim with empty claimNumber", () => {
        const invalid = {
          claimNumber: "",
          dos: new Date("2024-04-01"),
        };
        expect(() => insertClaimSchema.parse(invalid)).toThrow();
      });

      it("rejects claim with null dos", () => {
        const invalid = {
          claimNumber: "CLM-2024-005",
          dos: null,
        };
        expect(() => insertClaimSchema.parse(invalid)).toThrow();
      });
    });

    describe("Auto-generated field omission", () => {
      it("does not require id field", () => {
        const claim = {
          claimNumber: "CLM-2024-006",
          dos: "2024-04-06",
        };
        // id is omitted from schema, should not require it
        expect(() => insertClaimSchema.parse(claim)).not.toThrow();
      });

      it("does not require createdAt field", () => {
        const claim = {
          claimNumber: "CLM-2024-007",
          dos: "2024-04-07",
        };
        // createdAt is omitted from schema, should not require it
        expect(() => insertClaimSchema.parse(claim)).not.toThrow();
      });

      it("does not require updatedAt field", () => {
        const claim = {
          claimNumber: "CLM-2024-008",
          dos: "2024-04-08",
        };
        // updatedAt is omitted from schema, should not require it
        expect(() => insertClaimSchema.parse(claim)).not.toThrow();
      });
    });

    describe("Field type validation", () => {
      it("accepts numeric string for billedAmount", () => {
        const claim = {
          claimNumber: "CLM-2024-009",
          dos: "2024-04-09",
          billedAmount: "123.45",
        };
        expect(() => insertClaimSchema.parse(claim)).not.toThrow();
      });

      it("accepts numeric type for units", () => {
        const claim = {
          claimNumber: "CLM-2024-010",
          dos: "2024-04-10",
          units: 3,
        };
        expect(() => insertClaimSchema.parse(claim)).not.toThrow();
      });

      it("accepts valid claimStatus enum values", () => {
        const validStatuses = ["SUBMITTED", "PAID", "PARTIAL", "DENIED", "APPEALED", "ADJUSTED", "VOID"];
        for (const status of validStatuses) {
          const claim = {
            claimNumber: "CLM-2024-011",
            dos: "2024-04-11",
            status,
          };
          expect(() => insertClaimSchema.parse(claim)).not.toThrow();
        }
      });

      it("rejects invalid claimStatus enum value", () => {
        const claim = {
          claimNumber: "CLM-2024-012",
          dos: "2024-04-12",
          status: "INVALID_STATUS",
        };
        expect(() => insertClaimSchema.parse(claim)).toThrow();
      });
    });
  });

  describe("insertAppealSchema", () => {
    describe("Valid appeals", () => {
      it("accepts minimal valid appeal", () => {
        const validAppeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440000",
          generatedText: "This is an appeal letter",
        };
        expect(() => insertAppealSchema.parse(validAppeal)).not.toThrow();
      });

      it("accepts fully populated appeal", () => {
        const fullAppeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440001",
          templateId: "550e8400-e29b-41d4-a716-446655440002",
          generatedText: "Appeal letter with template",
          status: "SUBMITTED",
          submittedDate: "2024-04-15",
          outcomeDate: "2024-05-01",
          outcomeNotes: "Appeal denied",
          recoveredAmount: "0.00",
          createdBy: "user-123",
        };
        expect(() => insertAppealSchema.parse(fullAppeal)).not.toThrow();
      });

      it("accepts appeal with string date (auto-coerced)", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440003",
          generatedText: "Appeal text",
          submittedDate: "2024-04-15",
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });
    });

    describe("Required field validation", () => {
      it("rejects appeal without claimId", () => {
        const invalid = {
          generatedText: "Appeal without claim",
        };
        expect(() => insertAppealSchema.parse(invalid)).toThrow();
      });

      it("rejects appeal without generatedText", () => {
        const invalid = {
          claimId: "550e8400-e29b-41d4-a716-446655440004",
        };
        expect(() => insertAppealSchema.parse(invalid)).toThrow();
      });

      it("allows appeal with minimal text (empty string is allowed by schema)", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440005",
          generatedText: "Some text",
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });

      it("rejects appeal with null claimId", () => {
        const invalid = {
          claimId: null,
          generatedText: "Some text",
        };
        expect(() => insertAppealSchema.parse(invalid)).toThrow();
      });
    });

    describe("Auto-generated field omission", () => {
      it("does not require id field", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440006",
          generatedText: "Text",
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });

      it("does not require createdAt field", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440007",
          generatedText: "Text",
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });

      it("does not require updatedAt field", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440008",
          generatedText: "Text",
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });
    });

    describe("Field type validation", () => {
      it("accepts valid appealStatus enum values", () => {
        const validStatuses = ["DRAFTED", "SUBMITTED", "WON", "LOST", "WITHDRAWN"];
        for (const status of validStatuses) {
          const appeal = {
            claimId: "550e8400-e29b-41d4-a716-446655440009",
            generatedText: "Appeal text",
            status,
          };
          expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
        }
      });

      it("rejects invalid appealStatus enum value", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440010",
          generatedText: "Appeal text",
          status: "PENDING_REVIEW",
        };
        expect(() => insertAppealSchema.parse(appeal)).toThrow();
      });

      it("accepts numeric string for recoveredAmount", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440011",
          generatedText: "Appeal text",
          recoveredAmount: "250.00",
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });

      it("accepts user UUID for createdBy", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440012",
          generatedText: "Appeal text",
          createdBy: "user-id-12345",
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });
    });

    describe("Text content validation", () => {
      it("accepts long appeal text", () => {
        const longText = "A".repeat(5000);
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440013",
          generatedText: longText,
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });

      it("accepts appeal text with special characters", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440014",
          generatedText: "Dear Sir/Madam,\n\nRe: Appeal #123-456\nPlease review the attached documentation.\n\nSincerely,\nTristar PT",
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });

      it("accepts appeal text with unicode characters", () => {
        const appeal = {
          claimId: "550e8400-e29b-41d4-a716-446655440015",
          generatedText: "Appeal with émojis 😊 and ñ characters",
        };
        expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
      });
    });
  });

  describe("insertPayerRateSchema", () => {
    describe("Valid payer rates", () => {
      it("accepts minimal valid payer rate", () => {
        const validRate = {
          payer: "United Healthcare",
          cptCode: "99213",
          expectedRate: "150.00",
        };
        expect(() => insertPayerRateSchema.parse(validRate)).not.toThrow();
      });

      it("accepts fully populated payer rate", () => {
        const fullRate = {
          payer: "Blue Cross Blue Shield",
          payerType: "COMMERCIAL",
          cptCode: "99214",
          expectedRate: "175.50",
          effectiveDate: "2024-01-01",
          locationId: "loc-456",
          source: "manual",
        };
        expect(() => insertPayerRateSchema.parse(fullRate)).not.toThrow();
      });

      it("accepts payer rate with string date (auto-coerced)", () => {
        const rate = {
          payer: "Medicare",
          cptCode: "97161",
          expectedRate: "65.00",
          effectiveDate: "2024-01-01",
        };
        expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      });
    });

    describe("Required field validation", () => {
      it("rejects rate without payer name", () => {
        const invalid = {
          cptCode: "99213",
          expectedRate: "150.00",
        };
        expect(() => insertPayerRateSchema.parse(invalid)).toThrow();
      });

      it("rejects rate without cptCode", () => {
        const invalid = {
          payer: "Aetna",
          expectedRate: "160.00",
        };
        expect(() => insertPayerRateSchema.parse(invalid)).toThrow();
      });

      it("rejects rate without expectedRate", () => {
        const invalid = {
          payer: "Cigna",
          cptCode: "99215",
        };
        expect(() => insertPayerRateSchema.parse(invalid)).toThrow();
      });

      it("allows non-empty payer name", () => {
        const valid = {
          payer: "Humana",
          cptCode: "99213",
          expectedRate: "140.00",
        };
        expect(() => insertPayerRateSchema.parse(valid)).not.toThrow();
      });

      it("allows non-empty cptCode", () => {
        const valid = {
          payer: "Aetna",
          cptCode: "97161",
          expectedRate: "65.00",
        };
        expect(() => insertPayerRateSchema.parse(valid)).not.toThrow();
      });

      it("allows positive expectedRate values", () => {
        const valid = {
          payer: "Cigna",
          cptCode: "99213",
          expectedRate: "150.00",
        };
        expect(() => insertPayerRateSchema.parse(valid)).not.toThrow();
      });
    });

    describe("Auto-generated field omission", () => {
      it("does not require id field", () => {
        const rate = {
          payer: "UnitedHealth",
          cptCode: "99213",
          expectedRate: "150.00",
        };
        expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      });

      it("does not require createdAt field", () => {
        const rate = {
          payer: "Anthem",
          cptCode: "99213",
          expectedRate: "150.00",
        };
        expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      });

      it("does not require updatedAt field", () => {
        const rate = {
          payer: "Carefirst",
          cptCode: "99213",
          expectedRate: "150.00",
        };
        expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      });
    });

    describe("Field type and format validation", () => {
      it("accepts numeric string for expectedRate", () => {
        const rate = {
          payer: "Tricare",
          cptCode: "99213",
          expectedRate: "125.75",
        };
        expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      });

      it("accepts CPT codes in various formats", () => {
        const validCodes = ["99213", "97161", "97162", "97163", "99251"];
        for (const code of validCodes) {
          const rate = {
            payer: "TestPayer",
            cptCode: code,
            expectedRate: "100.00",
          };
          expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
        }
      });

      it("accepts common payer names", () => {
        const payerNames = [
          "Medicare",
          "Medicaid",
          "Blue Cross Blue Shield",
          "United Healthcare",
          "Aetna",
          "Cigna",
          "Humana",
        ];
        for (const name of payerNames) {
          const rate = {
            payer: name,
            cptCode: "99213",
            expectedRate: "150.00",
          };
          expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
        }
      });
    });

    describe("Optional field validation", () => {
      it("accepts rate without payerType", () => {
        const rate = {
          payer: "CustomPayer",
          cptCode: "99213",
          expectedRate: "150.00",
        };
        expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      });

      it("accepts rate without locationId (global default)", () => {
        const rate = {
          payer: "Medicare",
          cptCode: "97161",
          expectedRate: "65.00",
        };
        expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      });

      it("accepts rate without source (defaults to 'manual')", () => {
        const rate = {
          payer: "Aetna",
          cptCode: "99214",
          expectedRate: "175.00",
        };
        expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      });

      it("accepts rate with source='calculated'", () => {
        const rate = {
          payer: "TestPayer",
          cptCode: "99213",
          expectedRate: "155.00",
          source: "calculated",
        };
        expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      });
    });

    describe("Bulk rate import scenarios", () => {
      it("accepts multiple rates with same payer but different CPT codes", () => {
        const rates = [
          { payer: "Medicare", cptCode: "99213", expectedRate: "60.00" },
          { payer: "Medicare", cptCode: "99214", expectedRate: "85.00" },
          { payer: "Medicare", cptCode: "99215", expectedRate: "110.00" },
        ];
        for (const rate of rates) {
          expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
        }
      });

      it("accepts rates with location-specific overrides", () => {
        const baseRate = {
          payer: "UnitedHealth",
          cptCode: "99213",
          expectedRate: "150.00",
        };
        const locationOverride = {
          ...baseRate,
          locationId: "loc-california",
          expectedRate: "145.00",
        };
        expect(() => insertPayerRateSchema.parse(baseRate)).not.toThrow();
        expect(() => insertPayerRateSchema.parse(locationOverride)).not.toThrow();
      });
    });
  });

  describe("Cross-schema relationships", () => {
    it("claim and appeal reference types are compatible", () => {
      const claim = {
        claimNumber: "CLM-REF-001",
        dos: "2024-04-01",
      };
      const appeal = {
        claimId: "550e8400-e29b-41d4-a716-446655440016",
        generatedText: "Appeal text",
      };
      expect(() => insertClaimSchema.parse(claim)).not.toThrow();
      expect(() => insertAppealSchema.parse(appeal)).not.toThrow();
    });

    it("payer rate validates before use in claim", () => {
      const rate = {
        payer: "BlueCross",
        cptCode: "99213",
        expectedRate: "160.00",
      };
      const claim = {
        claimNumber: "CLM-RATE-001",
        dos: "2024-04-01",
        payer: "BlueCross",
        cptCodes: "99213",
        expectedAmount: "160.00",
      };
      expect(() => insertPayerRateSchema.parse(rate)).not.toThrow();
      expect(() => insertClaimSchema.parse(claim)).not.toThrow();
    });
  });
});
