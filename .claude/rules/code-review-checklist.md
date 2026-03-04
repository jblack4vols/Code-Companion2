# Code Review Checklist for AI Agents

When reviewing code changes in the Tristar 360° codebase, evaluate against every item below. Flag violations with severity: **Critical**, **Important**, or **Minor**.

## Security (Critical if violated)

- Every new/modified endpoint has `requireAuth` middleware
- Sensitive endpoints use `requireRole()` with correct roles per `docs/permissions.md`
- Mutation endpoints (PATCH, DELETE) enforce ownership for non-admin roles
- List endpoints returning location-sensitive data use `getUserLocationScope()` from `server/routes/shared.ts`
- Request bodies validated with Zod schemas before storage calls
- No PHI in logs, URLs, localStorage, or error responses
- No hardcoded secrets or credentials
- CSRF protection not accidentally bypassed on authenticated routes

## HIPAA Compliance (Critical if violated)

- Patient-adjacent data (referrals, physicians, collections) gated by role AND location
- Audit trail: data mutations produce audit log entries
- Session timeout (15 min) not extended or disabled
- Account lockout (10 attempts / 5 min) not weakened
- Export endpoints restricted to OWNER, DIRECTOR, ANALYST
- API key endpoints filter by `locationIds`

## Data Model (Important if violated)

- New tables defined in `shared/schema.ts`
- Insert schema created via `createInsertSchema` with `.omit` for auto-generated fields
- Insert type exported as `z.infer<typeof insertSchema>`
- Select type exported as `typeof table.$inferSelect`
- Array columns use `.array()` method syntax (e.g., `text().array()`)
- `IStorage` interface in `server/storage.ts` updated for new CRUD methods

## API Routes (Important if violated)

- Routes are thin — validation and response formatting only
- Business logic lives in storage layer or dedicated service modules
- Request body validated before passing to storage
- Consistent error handling with descriptive messages
- Pagination implemented for list endpoints that could return large datasets

## Frontend (Important/Minor)

- Data fetching uses `@tanstack/react-query` with object-form API (v5)
- Query keys use array format: `['/api/resource', id]` not template strings
- Mutations use `apiRequest` from `@lib/queryClient`
- Cache invalidated by `queryKey` after mutations
- Loading/skeleton states shown via `.isLoading` / `.isPending`
- Forms use `useForm` + `Form` from `@/components/ui/form` with `zodResolver`
- `data-testid` present on all interactive elements and key display elements
- No direct `React` imports (Vite JSX transform handles it)
- Environment variables use `import.meta.env.VITE_*` not `process.env`
- Uses shadcn components (Button, Card, Badge, Sidebar) — no custom reimplementations

## Styling (Minor)

- No emoji in UI or test data
- Layout changes never occur on hover (use `visibility` not `display`)
- Sticky elements have high `z-index`
- `hover-elevate` / `active-elevate-2` used for interactions, not custom `hover:bg-*`
- No `hover:bg-*` or `active:bg-*` on Button or Badge components
- Cards not nested inside cards
- Rounded elements do not have partial borders (e.g., no `border-l-4` on `rounded-md`)
- `size="icon"` buttons have no explicit `h-*` / `w-*` classes

## File Hygiene (Minor)

- Files under 200 lines
- No unused imports or dead code
- No `any` types without justification
- Follows existing naming conventions (kebab-case files, camelCase variables)
- No new files created when editing existing files would suffice
