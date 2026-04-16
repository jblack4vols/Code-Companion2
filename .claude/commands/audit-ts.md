---
name: audit-ts
description: Audit a TypeScript file for type safety, error handling, dead code, and complexity
---

Audit the file at $ARGUMENTS for these issues:

1. **Type safety**
   - Any `any` types → replace with proper interfaces
   - Missing return type annotations on exported functions
   - Unsafe type assertions (`as SomeType` without validation)

2. **Error handling**
   - Supabase calls without `.error` checks
   - try/catch blocks with empty catch or `console.log` only
   - Missing loading/error states in async components

3. **Brand & UX compliance**
   - Currency values not using `toLocaleString('en-US', { style: 'currency', currency: 'USD' })`
   - Percentages not formatted to one decimal place
   - Missing empty states or loading skeletons

4. **Dead code**
   - Unused imports
   - Commented-out code blocks > 3 lines
   - Unreachable code after return statements

5. **Complexity**
   - Functions > 50 lines → suggest extraction
   - Nesting deeper than 3 levels → suggest early returns
   - Component prop drilling > 2 levels → suggest Zustand store

**Output format:**
- Severity-ranked findings: CRITICAL → WARNING → INFO
- For each CRITICAL: show the problematic code + the fix
- Overall file health score: 1–10
- Apply all CRITICAL fixes directly to the file
