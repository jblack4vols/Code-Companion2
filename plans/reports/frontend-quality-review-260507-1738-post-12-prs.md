# Frontend Quality Review — Post-12-PRs (May 7)

Scope: 3 high-leverage areas across today's 12 merged PRs. Reviewer: code-reviewer agent. Read-only.

Files reviewed in depth:
- `client/src/components/voice-textarea.tsx` (NEW, 150 LOC, PR #18)
- `client/src/pages/physician-detail.tsx` mobile FAB block, lines 853-866 (PR #18)
- `client/src/pages/referral-trends.tsx` (NEW, 344 LOC, PR #11) + `server/routes/referrals.ts` `/api/referrals/provider-trends` (lines 343-431, PR #11)

Cross-cuts: file-size rule (CLAUDE.md "Files under 200 lines"), `any`-type drift since baseline 487 (audit `code-review-260507-1535`).

---

## Critical

### C1. FAB visually collides with global mobile bottom nav (PR #18)
`client/src/pages/physician-detail.tsx:860` renders `<Button className="md:hidden fixed bottom-4 right-4 z-40 h-14 w-14 ...">`.

`client/src/components/mobile-quick-actions.tsx:28` renders a global mobile bottom navigation: `<nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden ...">`, mounted in `App.tsx:236` for every authenticated route.

Both use `md:hidden` + `z-40` + `fixed bottom-*`. The FAB sits at viewport-bottom 16px with a 56px button (top edge ~72px from bottom). The global nav is ~56px tall + safe-area inset, anchored at `bottom-0`. The FAB therefore overlaps the right-most nav item ("Tasks") on every mobile breakpoint of physician-detail. Same z-index means stacking order is paint-order-dependent (last in DOM wins → FAB) but the underlying tap target ("Tasks") is occluded by the FAB's 56px square in the corner.

Fix: bump FAB to `bottom-20` (offsets above the ~64px nav) and either keep `z-40` or raise to `z-50` for clarity. Optionally add `pb-[env(safe-area-inset-bottom)]` to the parent or use `bottom-[calc(5rem+env(safe-area-inset-bottom))]`.

### C2. Voice transcript silently overwrites user keystrokes during recognition (PR #18)
`voice-textarea.tsx:92` captures `baseValueRef.current = innerRef.current?.value ?? ""` once at `startListening`. Every subsequent `onresult` calls `appendTranscript` which sets `next = baseValueRef.current + " " + text` and writes it via the native value setter (line 81-83). 

Race: if the user types into the textarea WHILE voice is recording (very plausible on mobile keyboard + dictation hybrid use), each `onresult` event silently destroys those keystrokes by reverting to baseValue + transcript. Interim results fire continuously (~every few hundred ms), so the destruction is real-time and complete. Form submission may capture an outdated value with the user's typed addition wiped.

Fix: read `innerRef.current?.value` fresh at the start of `appendTranscript`, slice off the previously appended transcript portion (track length of last write), and concatenate against the live value. Or disable typing while listening (`readOnly` until stop). Or switch to controlled mode while listening.

### C3. API response shape — inconsistent casing convention (PR #11)
`server/routes/referrals.ts:416-426` returns `{ currentMonth, priorMonth, totals: { current, prior, changeAbsolute, changePercent }, rows }` where `rows` is `result.rows` straight from raw SQL — fully snake_case (`physician_id`, `first_name`, `last_name`, `practice_name`, `current_count`, `prior_count`, `change_absolute`, `change_percent`).

Rest of the codebase (e.g., `physician-detail.tsx:285,362` using `physician.firstName`, `physician.lastName`, `physicianId`) is camelCase end-to-end. The new endpoint mixes conventions in a single response: top-level/`totals` is camelCase, but `rows[]` is snake_case. The frontend `TrendRow` interface in `referral-trends.tsx:14-27` matches the snake_case but only because it was hand-aligned to the SQL. Any future shared `Physician` type will not match.

Beyond style: pg returns `bigint` (COUNT) and `numeric` (ROUND) as JS strings. The client interface declares `current_count: number | string` and wraps every numeric read in `Number(...)` defensively — works, but the `number | string` union is a smell that should not exist.

Fix at the boundary: map server-side to camelCase + numeric:
```ts
const rows = result.rows.map((r: any) => ({
  physicianId: r.physician_id,
  firstName: r.first_name,
  lastName: r.last_name,
  credentials: r.credentials,
  specialty: r.specialty,
  practiceName: r.practice_name,
  relationshipStage: r.relationship_stage,
  currentCount: Number(r.current_count),
  priorCount: Number(r.prior_count),
  changeAbsolute: Number(r.change_absolute),
  changePercent: r.change_percent === null ? null : Number(r.change_percent),
  trend: r.trend as "up" | "down" | "flat",
}));
```
Then drop all `Number(...)` wrapping in the client and remove the `string` arms from the interface.

---

## Important

### I1. `voice-textarea.tsx` — final transcripts may concatenate without spacing (PR #18)
Line 103: `if (result.isFinal) finalText += transcript;`. Two consecutive final results that arrive without intervening interims will smash if the browser does not emit a leading space in each transcript. Chrome typically emits leading whitespace, but webkit/iOS Safari behavior is inconsistent. Result on iOS could be `"hellothere"` instead of `"hello there"`.

Fix: `if (result.isFinal) finalText += (finalText && !transcript.startsWith(" ") ? " " : "") + transcript;` — or normalize by collapsing internal whitespace before write.

### I2. `voice-textarea.tsx` — double-space when base ends in whitespace (PR #18)
Line 79: `next = (baseValueRef.current ? baseValueRef.current + " " : "") + text`. If user has typed `"Note: "` and starts voice, output becomes `"Note:  hello"` (two spaces). Minor UX nit; not a data corruption issue.

Fix: trim trailing whitespace before injecting the separator: `(baseValueRef.current.replace(/\s+$/, "") + " ")`.

### I3. `referral-trends.tsx` exceeds 200-line file rule (PR #11)
File is 344 LOC. CLAUDE.md `## 10. Coding Conventions` and `.claude/rules/development-rules.md` mandate "Keep individual code files under 200 lines for optimal context management." The page mixes:
- Query/state hooks
- A `SortHeader` inline component
- Three KPI summary Cards
- A 90-line `TableBody` render

Fix (low risk): extract `SortHeader` and the three KPI cards into a colocated `referral-trends-summary-cards.tsx`, and move row rendering into `referral-trends-row.tsx`. Brings page-level file under 200.

For comparison, `physician-detail.tsx` is 869 LOC — pre-existing violation, not in today's scope but should be flagged on next refactor.

### I4. iOS safe-area not honored at the viewport meta level
`client/index.html:5` — `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`. Missing `viewport-fit=cover`. Without it, `env(safe-area-inset-bottom)` resolves to `0` on iOS notched/home-indicator devices, so `MobileQuickActions`' `pb-[env(safe-area-inset-bottom)]` is a no-op AND the FAB at `bottom-4` has no safe-area padding fallback either. Today's mobile PR #18 was the right time to address this.

Fix: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`. Note PR #18 also unblocks pinch-zoom — confirm the viewport string is not adding `user-scalable=no` (it is not — good).

### I5. `Object.getOwnPropertyDescriptor` setter pattern is correct but undocumented (PR #18)
Line 81 — the native-setter-then-input-event pattern is the canonical React workaround for forcing onChange when mutating an uncontrolled input programmatically. The component header comment explains the intent (FormData / uncontrolled forms). Acceptable.

However, the cleaner React alternative — switch to controlled mode while voice is active — would also fix C2 (the user-keystroke race) for free. Worth considering as a refactor.

---

## Minor

### M1. `declare global` Web Speech API typings — future conflict risk (PR #18)
Lines 9-33 declare minimal types and augment `Window` with `SpeechRecognition?` / `webkitSpeechRecognition?`. If `@types/dom-speech-recognition` is later installed (e.g., transitively), TypeScript will report "duplicate identifier 'SpeechRecognition'" at the type level. Probability low but worth a one-line comment or a separate `*.d.ts` file gated by `tsconfig` types array.

Fix: add code comment `// If @types/dom-speech-recognition is added, delete this block.` next to line 7-8.

### M2. `recogRef.current?.stop()` cleanup correctness (PR #18)
Line 68 — verified correct. Effect with empty deps array runs the returned cleanup on unmount. `SpeechRecognition.stop()` is idempotent per W3C draft. No leak.

### M3. `referral-trends.tsx` — `trend` enum lives in two places (PR #11)
Server SQL `CASE WHEN ... THEN 'up' ... 'down' ... 'flat'` (line 403-407) and client union `"up" | "down" | "flat"` (line 26). When you fix C3, hoist this to a shared schema.

### M4. `referral-trends.tsx` not using `apiRequest` helper (PR #11)
Line 66-72 uses raw `fetch(..., { credentials: "include" })`. The codebase standard per `.claude/rules/code-review-checklist.md` "Frontend" section is `apiRequest` from `@lib/queryClient`. Inconsistent with rest of new code. Not a bug — readability/consistency.

### M5. Empty-state and loading-state divergence
`referral-trends.tsx` shows skeleton rows during loading (good — uses `Skeleton`, not spinner — matches CLAUDE.md `## 10`). Empty state has CTA-light copy ("Try a different month range") — meets the "Empty states need a CTA" rule loosely.

### M6. `data-testid` coverage — solid
Both new components have full `data-testid` coverage. FAB has it. Voice button has it. Trends table rows have it. No issues.

---

## What's solid

- **Voice button a11y**: aria-label toggles between "Start voice input" / "Stop voice input" — correctly dynamic.
- **FAB a11y + testid**: PR #16's a11y standards followed (line 861-862).
- **Defensive numeric coercion** in `referral-trends.tsx` — every `current_count`, `prior_count`, `change_absolute`, `change_percent` read goes through `Number()`. Survives the pg-string-from-numeric quirk.
- **No new `any` types added today** in client code. Only pre-existing `any` in `lifecycle.tsx` and `rpv-analytics-chart.tsx` (both from April 16). Baseline of 487 unchanged from PR #11/#18.
- **FormData compatibility**: `VoiceTextarea` correctly preserves uncontrolled-form behavior — no breaking change to existing forms that consume it via `<form>` + `name=`.
- **forwardRef dual-ref handling** (lines 70-74): correctly handles both function refs and `MutableRefObject`. No leaks.
- **`useEffect` cleanup** (line 68): correct semantics, idempotent stop().
- **Browser-feature gating**: `setSupported(getRecognitionCtor() !== null)` runs in an effect → no SSR hydration mismatch (Window check + post-mount). Mic button only renders if supported.
- **Skeleton loaders** in trends page over spinners (CLAUDE.md compliance).
- **Skip-link / sticky header z-50 vs FAB z-40**: header-FAB layering correct (header above FAB on scroll, expected).

---

## Unresolved questions

1. Should `VoiceTextarea` switch to controlled mode while listening (fixes C2 cleanly)? Or block typing via `readOnly`? Product owner call — depends on whether hybrid voice+keyboard input is a wanted UX.
2. Does Tristar's iOS field-rep audience hit C2 in practice? If they always finish typing before pressing mic, the race never fires. Need usage telemetry before deciding severity scaling.
3. C3 migration: should the API mapping happen in `routes/referrals.ts` directly, or via a shared `mapTrendRow` util in `server/lib/`? Other endpoints in this file (`/by-location`, `/filter-options`) also leak snake_case — would benefit from a project-wide convention.
4. Is `viewport-fit=cover` blocked for any reason? PR #18 deliberately enabled pinch-zoom; was safe-area considered and deferred?
5. `referral-trends.tsx` has no role gating beyond `requireAuth` on the endpoint. Cross-check with `docs/permissions.md` — should this report be ANALYST/DIRECTOR/OWNER only? (Out of scope here — flag for the security reviewer.)
6. The 487 `any` baseline from `code-review-260507-1535` — is anyone actively burning that down, or is it accepted debt?
