# Microsoft Graph Integration Rewrite

**Branch:** `feat/microsoft-graph-rewrite`
**Date:** 2026-05-08
**Status:** in progress

## Why

Three Microsoft integrations are failing in prod:
1. SSO sign-in
2. Outlook calendar sync
3. SharePoint sync

The failure mode varies. Diagnostic before this branch confirmed:
- SSO + Outlook OAuth code paths are **fully implemented** (`server/routes/auth-microsoft-sso.ts`, `server/routes/outlook-oauth.ts`, `server/outlook-oauth-token-helpers.ts`, `user_oauth_tokens` table). Just no UI button + env vars likely missing on Railway.
- SharePoint still calls a Replit-Connectors-only `getAccessToken()` in `server/sharepoint.ts:8-39` — this is a real code rewrite.
- `server/outlook.ts` has a dead Replit-Connectors Graph fallback alongside the working SMTP path.

## Phases (one PR, three commits)

### Phase 1 — SSO button + env documentation
- Add "Sign in with Microsoft" button on `client/src/pages/login.tsx` that hits `GET /api/auth/microsoft`
- Update `.env.example` with `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_SECRET`
- After merge: Jordan sets vars on Railway + registers `https://crm.tristarpt.com/api/auth/microsoft/callback` and `/api/outlook/callback` in Azure AD app `debda2f0-a35b-44c9-8e0b-9d1d306c49a8`

### Phase 2 — SharePoint OAuth migration
- Replace `getAccessToken()` in `server/sharepoint.ts` with a function that reads from `user_oauth_tokens` table
- Use the OWNER user (or first user with admin SharePoint scope) as the service-account token source
- Wire a "Connect SharePoint" button in `/admin/settings` that runs the OAuth flow with `Sites.ReadWrite.All` + `Files.ReadWrite.All` scopes added to existing flow

### Phase 3 — Cleanup outlook.ts
- Remove the dead Replit Connectors Graph fallback (`getUncachableOutlookClient` and friends)
- SMTP path stays — it's what actually sends emails on Railway
- Remove unused `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, `WEB_REPL_RENEWAL` references

## Out of scope
- Adding a second SharePoint scope to the existing `outlook-oauth-token-helpers.ts` SCOPES const requires re-consent. Instead, Phase 2 introduces a separate consent flow for SharePoint.
- Multi-tenant SaaS extraction (CLAUDE.md long-term goal) — not now.

## Risks
- **Env var drift between Railway/Vercel.** PR #32 had a Vercel preview deploy. Need to confirm prod hosting before assuming env vars are on Railway alone.
- **Azure AD redirect URI registration**. If not registered, callbacks 400. PR notes will list exact URIs to add.
- **Re-consent loop.** If existing users have stored tokens at narrower scope, they'll need to disconnect+reconnect after Phase 2.

## Unresolved
- Which of Railway/Vercel hosts crm.tristarpt.com prod traffic?
- What email account should be the SharePoint service account?
