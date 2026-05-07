# Security/HIPAA Review — Post 12 PRs (May 7)

**Date:** 2026-05-07 17:38 UTC
**Branch:** `main` @ `52fb104`
**Reviewer scope:** SECURITY + HIPAA only (perf/UX delegated)
**Diff base:** `9349330` (baseline audit) → `HEAD`
**Files in scope:** `vite.config.ts`, `client/src/components/voice-textarea.tsx`, `server/routes/referrals.ts` (new `/api/referrals/provider-trends`), plus general scan for new logging of PHI.

---

## Critical

### S-1. Web Speech API ships PHI to Google with no BAA — HIPAA-violating by design
**Severity:** Critical (HIPAA)
**File:** `client/src/components/voice-textarea.tsx`
**Why:** Chrome (desktop + Android — almost 100% of field-rep devices that aren't iPhones) implements `webkitSpeechRecognition` by streaming raw audio to Google's general speech servers. Google does **not** offer a BAA for the browser Web Speech API (only for Cloud Speech-to-Text under specific configurations). Reps will dictate things like "John Doe, ACL revision, called Dr. Sorce" — that audio leaves the device, hits Google, no covered-entity protection. PHI exposure to a non-BAA third party is a HIPAA violation regardless of intent.
**iOS Safari:** on-device since 14.5+ — that path is fine.
**Concrete reproducer:** open `/interactions` in Chrome on Android, tap mic, say a patient name. Audio is on Google servers within seconds.
**Mitigation options:**
1. **Block the feature on Chrome.** Detect `userAgent.includes("Chrome") && !iOS` and hide the mic button. Or detect via UA and only show on iOS Safari. (Low effort, kills ~half the value.)
2. **Replace with a HIPAA-compliant transcription provider** under BAA (Deepgram, AssemblyAI, Google Cloud Speech-to-Text with BAA + data logging disabled). Stream from `MediaRecorder` to your own backend, proxy to vendor. (Real engineering: ~1–2 weeks.)
3. **Ship as-is with explicit user consent + warning** that voice notes shouldn't contain patient names. Risky — users will forget.
4. **Pull the feature.** Easiest legally clean option until #2 is built.

**Recommendation:** Pull the mic button or gate to iOS only this week; plan #2 next sprint. Do not let reps dictate patient names into Chrome in production.

### S-2. `Permissions-Policy: microphone=()` blocks voice-textarea outright in prod
**Severity:** Critical (functional, not security — but it's gated by the security middleware so calling it out here)
**File:** `server/routes.ts:69`
**Why:** The CSP-adjacent header sets `microphone=()` which denies microphone for **all** origins, including self. `recog.start()` will throw `NotAllowedError: Permission denied by permissions policy`. The voice-textarea catches this in `onerror` and shows the "Microphone access denied or unavailable" toast — so users see a graceful failure, but the feature never works.
**Test:** open prod, click mic. You'll only ever see the error toast.
**Fix:** if you ship voice-textarea at all, change `microphone=()` → `microphone=(self)`. But see S-1: don't fix S-2 in Chrome until S-1 is resolved, otherwise you've just unlocked the HIPAA leak. **The microphone block is currently saving you from the HIPAA violation.** Leave it `()` until S-1 is resolved.
**Recommendation:** treat this as load-bearing security control, not a bug. Document it in a comment so nobody "fixes" it later.

---

## Important

### S-3. SQL parameterization on `/api/referrals/provider-trends` — safe, but verify-by-eye
**Severity:** Important (passes review, no fix needed — flagged for confidence)
**File:** `server/routes/referrals.ts:343-431`
**Why:** the `${currentStart}::date` and `${priorStart}::date` interpolations inside Drizzle's `sql\`\`` template are **parameter bindings** (compiled to `$1::date`, `$2::date` etc. by Drizzle's `pg` driver), not string concatenation. Plus, `monthRe = /^\d{4}-(0[1-9]|1[0-2])$/` rejects anything that isn't a valid `YYYY-MM` before binding. The constructed `YYYY-MM-01` is structurally safe even if interpolation happened. The `locFilter` `sql\`AND r.location_id = ANY(${locationScope})\`` binds `locationScope` as a `text[]` parameter — also safe.
**Verdict:** no SQL injection vector here.

### S-4. `/api/referrals/provider-trends` authorization is consistent with neighbors but exposes physician trend data to all logged-in users
**Severity:** Important
**File:** `server/routes/referrals.ts:343`
**Why:** uses `requireAuth` (any authenticated user). Compared to the other read-only physician analytics endpoints in the same file:
  - `/api/referrals/trending` → `requireAuth`
  - `/api/referrals/by-location` → `requireAuth`
  - `/api/referrals/top-sources` → `requireAuth`
  - `/api/referrals/duplicates` → `requireRole("OWNER", "DIRECTOR")` (this one returns patient names; correctly restricted)

The new endpoint is consistent with `trending`/`top-sources` (no patient PHI in the payload, only physician aggregates). However, FRONT_DESK + ANALYST roles arguably shouldn't see referral-source business intelligence. CLAUDE.md / `code-review-checklist.md` say "Sensitive endpoints use `requireRole()` with correct roles per `docs/permissions.md`" — referral source rankings are competitively sensitive even without PHI.
**Recommendation:** tighten to `requireRole("OWNER", "DIRECTOR", "ANALYST", "MARKETER")` to match the audience that actually uses the Referral Trends page. Same change is justified for `/trending`, `/top-sources`, `/by-location` — but those are not in today's diff so out of scope for this review.
**Note:** location scoping IS correctly applied in the new endpoint via `getUserLocationScope` + `locFilter`. OWNER/DIRECTOR get all (`null`), scoped users get their `locationIds`, no-locations users get `AND 1=0` → empty result. Correct.

### S-5. Rollback risk for service worker updates — autoUpdate has a 1-reload window
**Severity:** Important
**File:** `vite.config.ts:12` (`registerType: "autoUpdate"`)
**Why:** if you rollback to fix a security issue (say, removing an XSS-vulnerable bundle), users with the OLD SW already activated keep serving the OLD precached JS until:
  1. They reload the page (autoUpdate detects new SW, `skipWaiting` + `clientsClaim` activate immediately).
  2. OR — for users with the app in the background — until they navigate.

Worst case: a user who installed the PWA to their home screen and never closes the tab keeps the old code. There's no `periodicSync` configured, so the SW won't proactively check for updates.
**Mitigation now:** acceptable for normal feature releases. **Not** acceptable for emergency security rollback — you need to alert affected users out-of-band (email, push) or wait it out.
**Recommended hardening:**
1. Add `cleanupOutdatedCaches: true` explicitly to workbox config (it's the default in vite-plugin-pwa 1.x, but pin it).
2. Consider adding a build-time version constant the client polls every N minutes. Force reload if mismatch.
3. Document in a runbook: "PWA rollback procedure: bump version, deploy, expect ≤1 reload tail latency."

### S-6. Workbox precache scope is fine, but there's no size cap configured
**Severity:** Important (preventive)
**File:** `vite.config.ts:32`
**Why:** `globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"]` precaches everything in `dist/public` matching those extensions. No `maximumFileSizeToCacheInBytes` set; default is 2 MiB. If a future build accidentally includes a large asset (PDF, video, source map), it either silently overflows the cap (build warning, not failure) or causes the SW to fail to install — which can break the entire SPA on some browsers.
**Audit of current bundle:** I didn't run `npm run build`, so I can't confirm what's bundled. **Action item:** run `npm run build` and grep `dist/public` for anything sus (test fixtures, sample data CSVs with PHI, hardcoded tokens in committed JS comments).
**Fix:** explicitly set `maximumFileSizeToCacheInBytes: 3000000` and add a CI check that bundle size hasn't crossed it.

### S-7. `globPatterns` excludes JSON — good for /seed and /__tests__ — but worth confirming
**Severity:** Minor (turning Important if violated)
**Why:** `**/*.{js,css,html,svg,png,woff,woff2}` does NOT match `.json`. So no risk of a JSON fixture with seed PHI being precached. ✅
**Recommendation:** add a comment to `vite.config.ts` next to `globPatterns` explaining the exclusion is intentional.

---

## Minor

### S-8. `apple-mobile-web-app-status-bar-style` set to `default` — fine, but `black-translucent` paints differently
**Severity:** Minor (not security)
**File:** `client/index.html:8`
**Out of scope** (UX, not security). Skipped.

### S-9. `viewport` removed `maximum-scale=1` to enable pinch-zoom (PR #18)
**Severity:** Minor (a11y win, no security impact)
**Why:** the meta-viewport change is an accessibility improvement. No security or PHI implications.

### S-10. `console.error("Unhandled error:", err)` at `server/middleware/errorHandler.ts:33` — UNCHANGED today
**Severity:** Minor (carryover from baseline audit)
**Verified:** `git diff 9349330..HEAD -- server/middleware/` returns nothing. The errorHandler is unchanged. **No new code today routes PHI-bearing errors through it.** The only new server `console.error` is in `referrals.ts:428` for the new endpoint, which catches a Postgres query error — those errors carry SQL state and our query strings, not request body data. Acceptable.

### S-11. Voice transcript DOM-mutation hack via `Object.getOwnPropertyDescriptor` — not a new attack surface
**Severity:** Minor / not-an-issue
**File:** `client/src/components/voice-textarea.tsx:81`
**Analysis:** the hack reads the native `value` setter from `HTMLTextAreaElement.prototype` to bypass React's controlled-input shim. A malicious browser extension with content-script access can already read/write any DOM element's value, hook `addEventListener`, and siphon transcripts. This pattern doesn't introduce a new vector — extensions own the page. **No fix.**

### S-12. Voice transcript not logged or sent anywhere besides the textarea
**Severity:** Minor (positive)
**Verified:** searched for fetch/sendBeacon/analytics/console.* in `voice-textarea.tsx` — none. Transcript only mutates the DOM textarea value and dispatches an `input` event. The textarea's content is then submitted via the form's existing mutation flow (which goes to `/api/interactions` etc. with normal CSRF + auth). **No client-side leak beyond the Web Speech API itself (S-1).**

### S-13. Google Fonts caching does not contain user-identifying info
**Severity:** Minor (positive)
**Verified:** `runtimeCaching` for `fonts.googleapis.com` (CSS) and `fonts.gstatic.com` (woff2 binaries) caches static font assets. Both are anonymous CDN responses, no per-user data, no cookies. Safe to cache.

---

## What's solid

- **navigateFallback denylist `[/^\/api\//]`** correctly prevents the SW from serving `index.html` in response to API requests. API 401s/500s pass through cleanly. No risk of stale auth UI being painted from cache — the SPA shell is content-free until `/api/auth/me` returns.
- **SW does NOT cache `/api/*`** (NetworkOnly). Confirmed. PHI never enters Cache Storage.
- **No client-side `localStorage` writes added today** carry PHI. The existing localStorage uses (`theme`, `dashboard.tile_layout`, `provider-offices.*`) are all preferences, not patient data.
- **No client secrets** found in `client/src/**`. `import.meta.env` not used; no `VITE_*` vars baked into the bundle. Confirmed by grep.
- **Drizzle SQL parameterization** is used correctly throughout the new endpoint.
- **Location scoping** in `/api/referrals/provider-trends` correctly handles OWNER/DIRECTOR (null → all locations), scoped users (array → ANY filter), no-assignment users (empty array → `AND 1=0` → no rows). Logic is clean.
- **CSRF + session + rate limiter** all apply to the new endpoint via `app.use("/api", ...)` middleware.
- **Audit log not bypassed:** the new endpoint is read-only and doesn't need an audit-log entry; mutation endpoints in the same file all call `storage.createAuditLog`.
- **Service worker registration is same-origin only** (CSP `script-src 'self'`). Workbox SW served from `/sw.js` on the app's own origin. No cross-origin SW risk.

---

## Unresolved questions

1. **What is the Tristar BAA stance on Microsoft 365 dictation / built-in iOS keyboard mic?** If reps already dictate via the native iOS keyboard (which goes through Apple's on-device dictation post-iOS 13 for short utterances), that's HIPAA-acceptable. The question is whether the *web* mic button adds new exposure beyond what reps already do. Probably yes (Chrome on Android), so S-1 still stands.
2. **Is there a Railway-side env var or feature flag** to disable the voice-textarea without a redeploy? Worth adding a `VITE_FEATURE_VOICE_NOTES=false` kill switch for fast rollback if the HIPAA conversation gets uncomfortable.
3. **Has Tristar engaged a HIPAA auditor** to review the system architecture? If yes, this report should be shared with them. If no, that's a separate critical finding outside this review's scope.
4. **What happens to a session cookie when the PWA is reinstalled / homescreen icon removed and re-added?** Most browsers preserve cookies across PWA reinstall (it's still the same origin), but worth confirming on iOS Safari standalone mode where storage scoping is sometimes weird. Not blocking — just operationally relevant.
5. **Is there a stored-XSS path through `interactions.summary`?** Voice transcripts go into a textarea, get POSTed as plain text to `/api/interactions`, stored, and rendered later. Did not audit the rendering path in this review (out of scope — diff didn't change interaction read paths). Worth a follow-up: confirm React's default escaping is intact on `interactions.summary` display, no `dangerouslySetInnerHTML`.

---

**Bottom line:** S-1 is the only finding that should make you stop and re-evaluate before tomorrow. Everything else is either fine, mitigated by an unrelated control (S-2 covers S-1 today), or a hardening recommendation. Pull the mic button on Chrome before any rep dictates a real patient name into prod.
