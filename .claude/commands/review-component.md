---
name: review-component
description: Review a React component for brand compliance, accessibility, and shadcn/ui usage
---

Review the component at $ARGUMENTS:

**Brand compliance:**
- Primary actions use `#FF8200` background
- Accent backgrounds use `#FFEAD5`
- No unauthorized color values (flag anything not in the brand palette or Tailwind neutrals)
- Font hierarchy is max 3 sizes

**shadcn/ui compliance:**
- Buttons use shadcn `Button` — not raw `<button>`
- Modals use shadcn `Dialog` — not custom overlays
- Alerts use shadcn `Alert` — not raw divs
- Tables use shadcn `Table` — not raw `<table>`
- Loading states use shadcn `Skeleton`

**Accessibility:**
- Interactive elements have accessible labels (`aria-label` or visible text)
- Color is not the only indicator of state (always pair with text or icon)
- Keyboard navigable (no click-only interactions without keyboard equivalent)

**Data integrity:**
- Currency formatted with `toLocaleString`
- No PHI exposed (patient names, DOBs, insurance IDs)
- No hardcoded API keys or secrets

List all findings and apply fixes directly.
