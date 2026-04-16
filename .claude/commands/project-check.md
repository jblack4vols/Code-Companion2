# Project Check-In

Run this at the start of each dev session to get oriented.

## Quick Status Check
1. Run `git status` and `git log --oneline -5` to see current branch and recent changes
2. Run `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l` to verify zero TypeScript errors
3. Run `npx vitest run 2>&1 | tail -5` to confirm all tests pass
4. Check `curl -s https://crm.tristarpt.com/api/health` to verify production is up

## Project Context
- **App:** Tristar 360 CRM — physician liaison tool for 8 PT clinics
- **Live:** https://crm.tristarpt.com (Vercel + Neon PostgreSQL)
- **Branch:** check with `git branch --show-current`
- **PR:** check with `gh pr list --state open`

## Architecture Quick Reference
- Frontend: `client/src/pages/` (React + shadcn + TanStack Query)
- API: `server/routes/` (Express 5 + Drizzle ORM)
- Schema: `shared/schema.ts` (Drizzle tables + Zod validation)
- Storage: `server/storage*.ts` (split by domain)
- Tests: `server/__tests__/` (Vitest)
- Design: `docs/design-system.md`
- Permissions: `docs/permissions.md`

## Deploy Checklist
1. `npx tsc --noEmit` — zero errors
2. `npx vitest run` — all tests pass
3. `npx tsx script/build-vercel.ts` — builds client + API bundle
4. `npx vercel deploy --prod --yes` — deploy to crm.tristarpt.com
5. `git add . && git commit && git push`

## Current Session
Checking status for: $ARGUMENTS

Run the status checks above and report what needs attention.
