# Phase 05: Auto-Appeal Draft Generator

## Context Links
- [Phase 01 - Data Model](./phase-01-data-model.md)
- [Phase 03 - Denial Intelligence](./phase-03-denial-intelligence.md)

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 3h
- **Depends on:** Phase 01 (schema), Phase 02 (claim storage)
- Template-based appeal letter generation with claim data merge, appeal lifecycle tracking

## Key Insights
- Templates use `{{placeholder}}` syntax for variable substitution
- Each template can target specific denial codes via `denialCodePattern` field
- Appeal lifecycle: DRAFTED -> SUBMITTED -> WON/LOST/EXPIRED
- Track financial outcomes: `outcomeAmount` on WON appeals measures recovery value
- No AI generation needed -- simple string replacement is sufficient for v1

## Template Placeholders

Standard placeholders available for all templates:

| Placeholder | Source | Example |
|------------|--------|---------|
| `{{claimNumber}}` | claims.claimNumber | CLM-2026-00142 |
| `{{patientName}}` | claims.patientName | John Doe |
| `{{patientAccountNumber}}` | claims.patientAccountNumber | PA-12345 |
| `{{dateOfService}}` | claims.dateOfService | 02/10/2026 |
| `{{payer}}` | claims.payer | Blue Cross Blue Shield |
| `{{cptCodes}}` | claims.cptCodes (joined) | 97110, 97140 |
| `{{billedAmount}}` | claims.billedAmount | $180.00 |
| `{{paidAmount}}` | SUM(claim_payments.paidAmount) | $127.00 |
| `{{denialCodes}}` | claim_payments.denialCodes (joined) | CO-4, CO-16 |
| `{{denialReasons}}` | denial_codes.description (joined) | Service not consistent... |
| `{{providerName}}` | users.name | Dr. Smith |
| `{{clinicName}}` | locations.name | TriStar Clinic A |
| `{{clinicAddress}}` | locations.address | 123 Main St |
| `{{currentDate}}` | runtime | 02/27/2026 |
| `{{variance}}` | expected - paid | $26.00 |

## Storage Functions

Add to `server/storage-revenue-recovery.ts`.

### Appeal Template CRUD

```typescript
// getAppealTemplates(activeOnly?: boolean) -- list templates
// getAppealTemplateById(id) -- single template
// createAppealTemplate(data: InsertAppealTemplate) -- create
// updateAppealTemplate(id, data: Partial<InsertAppealTemplate>) -- update
// deleteAppealTemplate(id) -- soft delete via isActive=false
// matchTemplateForDenial(denialCodes: string[]) -- find best template match
```

### Appeal CRUD

```typescript
// getAppeals(filters: { claimId?, status?, dateFrom?, dateTo?, page?, pageSize? })
//   Returns: PaginatedResult<AppealWithClaim>

// getAppealById(id) -- single appeal with claim + template info

// generateAppeal(claimId, claimPaymentId?, templateId?) -- build appeal text
//   1. Load claim + payments + denial codes
//   2. Find matching template (by denialCodes or explicit templateId)
//   3. Replace all {{placeholders}} with actual data
//   4. Create appeal record with status=DRAFTED
//   Returns: Appeal

// updateAppealStatus(id, status, outcomeAmount?, notes?)
//   Validates transitions: DRAFTED->SUBMITTED, SUBMITTED->WON/LOST/EXPIRED

// getAppealOutcomeSummary(dateFrom?, dateTo?)
//   Returns: { total, drafted, submitted, won, lost, expired,
//              winRate, totalRecovered, avgRecoveryAmount }
```

### Template Matching Logic

```typescript
function matchTemplateForDenial(denialCodes: string[], templates: AppealTemplate[]): AppealTemplate | null {
  // 1. Find templates where denialCodePattern matches any of the denial codes
  // 2. Pattern format: comma-separated codes or simple regex
  //    e.g., "CO-4,CO-16" matches if any denial code is CO-4 or CO-16
  // 3. If multiple match, prefer most specific (fewest codes in pattern)
  // 4. Fall back to template with null denialCodePattern (generic template)
}
```

### Placeholder Replacement

```typescript
function renderAppealText(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] ?? match);
}
```

## API Routes

Add to `server/routes/revenue-recovery.ts`.

### Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/revenue-recovery/appeal-templates` | OWNER,DIRECTOR,ANALYST | List templates |
| GET | `/api/revenue-recovery/appeal-templates/:id` | OWNER,DIRECTOR,ANALYST | Get template |
| POST | `/api/revenue-recovery/appeal-templates` | OWNER | Create template |
| PATCH | `/api/revenue-recovery/appeal-templates/:id` | OWNER | Update template |
| DELETE | `/api/revenue-recovery/appeal-templates/:id` | OWNER | Deactivate template |
| GET | `/api/revenue-recovery/appeals` | OWNER,DIRECTOR,ANALYST | List appeals (paginated) |
| GET | `/api/revenue-recovery/appeals/:id` | OWNER,DIRECTOR,ANALYST | Get appeal detail |
| POST | `/api/revenue-recovery/appeals/generate` | OWNER,DIRECTOR | Generate appeal from claim |
| PATCH | `/api/revenue-recovery/appeals/:id/status` | OWNER,DIRECTOR | Update appeal status |
| GET | `/api/revenue-recovery/appeals/summary` | OWNER,DIRECTOR,ANALYST | Appeal outcome summary |

### Request: Generate Appeal

```json
{
  "claimId": "uuid",
  "claimPaymentId": "uuid (optional - specific denial)",
  "templateId": "uuid (optional - override auto-match)"
}
```

### Request: Update Appeal Status

```json
{
  "status": "SUBMITTED",
  "submittedDate": "2026-02-27",
  "notes": "Submitted via payer portal"
}
```

Or for outcome:
```json
{
  "status": "WON",
  "outcomeDate": "2026-03-15",
  "outcomeAmount": 26.00,
  "notes": "Full variance recovered"
}
```

### Response: Appeal Outcome Summary

```json
{
  "total": 45,
  "drafted": 8,
  "submitted": 12,
  "won": 18,
  "lost": 5,
  "expired": 2,
  "winRate": 78.3,
  "totalRecovered": 4680.00,
  "avgRecoveryAmount": 260.00
}
```

## Default Templates (Seed Data)

Provide 3 starter templates on first deploy. Store in a seed function called from route registration if `appeal_templates` table is empty.

### Template 1: Medical Necessity Denial (CO-50, CO-55)

```
Re: Appeal for Claim {{claimNumber}}

Dear Claims Review Department,

I am writing to appeal the denial of claim {{claimNumber}} for patient
{{patientName}} (Account #{{patientAccountNumber}}) for services rendered
on {{dateOfService}}.

The claim was denied with reason code(s): {{denialCodes}}
({{denialReasons}})

The CPT codes billed ({{cptCodes}}) reflect medically necessary services
prescribed by the referring provider. The patient's treatment plan
supports the medical necessity of these procedures.

Billed amount: {{billedAmount}}
Amount paid: {{paidAmount}}

We respectfully request a full review of this denial.

Sincerely,
{{clinicName}}
{{clinicAddress}}
Date: {{currentDate}}
```

### Template 2: Underpayment Appeal (generic)

```
Re: Underpayment Appeal - Claim {{claimNumber}}

Dear Provider Relations,

We have identified an underpayment on claim {{claimNumber}} for
{{patientName}}, date of service {{dateOfService}}.

Billed: {{billedAmount}}
Expected (per contract): {{variance}} above amount paid
Paid: {{paidAmount}}
Underpayment: {{variance}}

CPT Codes: {{cptCodes}}
Payer: {{payer}}

Please review and reprocess this claim per our contracted rates.

{{clinicName}}
{{currentDate}}
```

### Template 3: Missing Information (CO-16, CO-252)

```
Re: Additional Information - Claim {{claimNumber}}

Dear Claims Department,

In response to your request for additional information regarding
claim {{claimNumber}} (denial codes: {{denialCodes}}), please find
the following:

Patient: {{patientName}} (Account: {{patientAccountNumber}})
Date of Service: {{dateOfService}}
Services: {{cptCodes}}
Provider: {{providerName}}

[ATTACH SUPPORTING DOCUMENTATION HERE]

Please reprocess this claim at your earliest convenience.

{{clinicName}}
{{currentDate}}
```

## Implementation Steps

1. Add appeal template CRUD functions to storage
2. Add appeal CRUD + generate function to storage
3. Implement placeholder replacement logic
4. Implement template matching by denial codes
5. Add all API endpoints
6. Add seed templates function (run once if table empty)
7. Run `npm run check`

## Related Code Files
- **Modify:** `server/storage-revenue-recovery.ts`
- **Modify:** `server/routes/revenue-recovery.ts`

## Todo List
- [ ] Implement appeal template CRUD
- [ ] Implement appeal CRUD + pagination
- [ ] Implement generateAppeal with placeholder replacement
- [ ] Implement template matching logic
- [ ] Implement appeal status transitions with validation
- [ ] Implement appeal outcome summary query
- [ ] Add seed templates
- [ ] Wire up all API endpoints
- [ ] Verify `npm run check` passes

## Success Criteria
- [ ] Appeal generated with all placeholders filled from claim data
- [ ] Template matching selects correct template for denial codes
- [ ] Status transitions enforce valid lifecycle
- [ ] Outcome summary calculates win rate and total recovered
- [ ] 3 seed templates auto-created on first use

## Risk Assessment
- **Missing placeholder data:** If a placeholder has no data (e.g., no providerName), keep the `{{placeholder}}` text so user can manually fill it
- **Template versioning:** Not needed for v1; templates are mutable. If a template is edited, existing appeals retain their `generatedText` unchanged
- **Appeal timing:** No automatic expiration enforcement; `EXPIRED` is a manual status update
