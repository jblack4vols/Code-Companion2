---
name: tristar-brand
description: Enforce Tristar PT brand tokens on the current component
---

Review the component at $ARGUMENTS (or the currently open file if no argument given) and enforce Tristar PT brand standards:

**Brand tokens to enforce:**
- Primary orange: `#FF8200` — use for CTAs, active nav states, badges, progress indicators
- Accent/light orange: `#FFEAD5` — use for hover backgrounds, subtle highlights, card accents
- Dark: `#000000` — primary text, nav backgrounds
- Light: `#FFFFFF` — card backgrounds, input backgrounds

**Rules to check and fix:**
1. Replace any generic Tailwind colors (blue-500, indigo-600, etc.) with the brand palette equivalents
2. Ensure all primary action buttons use the `#FF8200` background
3. Ensure all shadcn/ui components use the correct CSS variable overrides — do not use inline styles
4. Check that heading hierarchy uses at most 3 font sizes on the page
5. Confirm empty states, loading skeletons, and error states are present
6. Flag any hardcoded hex colors that are NOT in the brand palette

After reviewing, apply all fixes directly to the file. List what you changed.
