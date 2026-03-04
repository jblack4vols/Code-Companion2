# Code Review Process — Tristar 360°

## Overview

This document defines the code review workflow for the Tristar 360° healthcare liaison platform. All changes must pass review before merge. Reviews focus on security (HIPAA compliance), performance, accessibility, and code quality.

## Review Checklist

### Security

- [ ] No PHI (Protected Health Information) logged to console or persisted outside the database
- [ ] All new endpoints use `requireAuth` middleware
- [ ] Role-based access enforced via `requireRole()` for sensitive operations
- [ ] Ownership checks present for mutation endpoints (PATCH, DELETE)
- [ ] Location scoping applied via `getUserLocationScope()` for list endpoints
- [ ] No hardcoded credentials, API keys, or secrets in source code
- [ ] CSRF protection not bypassed for authenticated routes
- [ ] Input validated with Zod schemas before reaching storage layer
- [ ] SQL injection prevented (parameterized queries via Drizzle ORM)
- [ ] Rate limiting applied to auth-related endpoints

### HIPAA-Specific Items

- [ ] Patient-adjacent data (referrals, physician records) access-controlled by role and location
- [ ] Audit log entries created for data mutations (create, update, delete)
- [ ] Session timeout enforced (15-minute rolling window)
- [ ] Account lockout active (10 failed attempts → 5-minute lock)
- [ ] No PHI in URL query parameters or client-side localStorage
- [ ] Error responses do not leak internal data structures or PHI
- [ ] Export/CSV endpoints restricted to OWNER, DIRECTOR, ANALYST roles
- [ ] API key scoped to specific `locationIds`

### Performance

- [ ] Database queries use appropriate indexes (check Drizzle schema)
- [ ] No N+1 query patterns in list endpoints
- [ ] Pagination implemented for endpoints returning large datasets
- [ ] Heavy computations offloaded from request handlers
- [ ] React Query cache invalidation targeted (invalidate by specific `queryKey`, not broad)
- [ ] No unnecessary re-renders (check dependency arrays in hooks)

### Accessibility

- [ ] Interactive elements have `data-testid` attributes
- [ ] Form fields have associated labels
- [ ] Color contrast meets WCAG AA (especially light/dark mode transitions)
- [ ] Keyboard navigation works for all interactive flows
- [ ] Loading/skeleton states shown during async operations

### Code Quality

- [ ] Follows YAGNI, KISS, DRY principles
- [ ] Files under 200 lines where possible
- [ ] Types defined in `shared/schema.ts` with insert schemas via `drizzle-zod`
- [ ] Storage interface (`IStorage`) updated for new CRUD operations
- [ ] API routes thin — business logic lives in storage or dedicated modules
- [ ] No `any` types without justification
- [ ] Error handling uses try/catch with descriptive messages
- [ ] No unused imports or dead code

## Severity Classification

| Severity | Definition | Action Required |
|----------|-----------|-----------------|
| **Critical** | Security vulnerability, data exposure, HIPAA violation, broken auth | Fix immediately before merge |
| **Important** | Missing validation, performance regression, broken functionality | Fix before merge |
| **Minor** | Style inconsistency, missing test ID, naming convention | Fix or document as follow-up |

## Edge Case Scouting Process

Before requesting a code review, the author should scout for edge cases:

1. **Identify affected files** — List all changed files and their dependencies
2. **Trace data flows** — Follow data from API request → validation → storage → response
3. **Check error paths** — What happens on invalid input, missing records, unauthorized access?
4. **Test boundary conditions** — Empty arrays, null values, maximum lengths, concurrent requests
5. **Verify role permutations** — Test each role (OWNER, DIRECTOR, MARKETER, FRONT_DESK, ANALYST) against the endpoint
6. **Location scoping** — Verify users only see data for their assigned locations

## Review Request Template

When requesting a review, provide:

```
## What Changed
Brief description of the feature or fix.

## Files Modified
- server/routes/example.ts — new endpoint for X
- shared/schema.ts — added Y table
- client/src/pages/example.tsx — UI for Z

## Testing Done
- [ ] Manual testing with roles: OWNER, MARKETER
- [ ] Edge cases scouted (empty data, unauthorized access)
- [ ] Existing tests still pass

## HIPAA Impact
Does this change touch patient-adjacent data? [Yes/No]
If yes, describe access controls applied.

## Screenshots
(For UI changes)
```

## Review Workflow

1. **Author** scouts edge cases and self-reviews against the checklist
2. **Author** submits review request with the template above
3. **Reviewer** classifies findings by severity (Critical, Important, Minor)
4. **Author** fixes Critical and Important items
5. **Reviewer** verifies fixes with fresh evidence (test output, not assumptions)
6. **Merge** once all Critical and Important items resolved

## Common Pitfalls in This Codebase

| Area | Pitfall | Prevention |
|------|---------|------------|
| Auth | Adding endpoint with only `requireAuth` when role check needed | Check permission matrix in `docs/permissions.md` |
| Location | Forgetting `getUserLocationScope()` on new list endpoints | All list endpoints returning location-sensitive data must scope |
| Schema | Not creating insert schema with `createInsertSchema` | Every new table needs insert schema + types in `shared/schema.ts` |
| Frontend | Using `queryKey` as template string instead of array | Always use `['/api/resource', id]` format for cache invalidation |
| Frontend | Missing `data-testid` on interactive elements | Every button, input, link needs a descriptive test ID |
| Storage | Bypassing `IStorage` interface | All DB access goes through storage — never import `db` in routes |
