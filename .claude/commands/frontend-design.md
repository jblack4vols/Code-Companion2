---
name: frontend-design
description: Generate a polished, production-grade UI screen for crm.tristarpt.com
---

Build the screen or component described in $ARGUMENTS.

**Stack:** Next.js App Router, Tailwind CSS, shadcn/ui, Lucide icons, Zustand for state.

**Design requirements:**
- Brand colors: primary `#FF8200`, accent `#FFEAD5`, dark `#000000`, light `#FFFFFF`
- Use shadcn/ui primitives exclusively — Card, Table, Badge, Button, Dialog, Alert, Skeleton
- Strong visual hierarchy: page title → section headers → data → actions
- Data tables must be sortable on the primary numeric column
- Every data view needs: loading state (Skeleton), empty state (message + CTA), error state (Alert destructive)
- Dense, scannable layout — this is an ops dashboard for a practice owner, not a consumer app
- Responsive: functional on 1280px+ desktop first; mobile is secondary

**Code requirements:**
- TypeScript with proper interfaces in `src/types/`
- Server Component by default; add `"use client"` only if needed
- Currency: `toLocaleString('en-US', { style: 'currency', currency: 'USD' })`
- Percentages: `(ratio * 100).toFixed(1) + '%'`
- Dates: `date-fns` format `MMM d, yyyy`
- No `<form>` tags — use controlled inputs with onClick/onChange

After building, run `/tristar-brand` to verify brand compliance.
