---
name: project-check
description: Session check-in — surfaces what's next on the CRM roadmap and recent context
---

Start this Claude Code session with a structured check-in for crm.tristarpt.com development.

1. **Read the current state of the codebase** — scan `src/app/` for existing routes and `src/components/features/` for built modules. List what exists.

2. **Check the roadmap from CLAUDE.md** and identify which features are complete vs. still to build:
   - Referral Intelligence Dashboard
   - RPV Analytics by Location
   - Provider Productivity View
   - Patient Lifecycle Funnel
   - BCBS Audit Status Panel
   - Cash Flow Projection

3. **Surface any immediate issues:**
   - TypeScript errors: run `npm run type-check` and report
   - Lint warnings: run `npm run lint` and report
   - Any TODO/FIXME comments in recently modified files

4. **Recommend the next task** — one specific, scoped feature or fix based on the roadmap order and current state.

5. **Ask:** "Ready to start [recommended task]? Or is there something else you want to work on?"
