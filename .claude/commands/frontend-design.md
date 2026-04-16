# Frontend Design

Generate polished, production-grade UI for Tristar 360 CRM screens. Apply Modern Clinical aesthetic.

## Design System
- **Style:** Modern Clinical — clean, professional, subtle shadows, WCAG AA accessible
- **Font:** DM Sans body, Montserrat headings (`font-heading` class)
- **Shadows:** Enabled (subtle elevation on cards and containers)
- **Radius:** 0.75rem (`rounded-lg`) — professional, not playful
- **Colors:** Use CSS tokens (`bg-primary`, `text-foreground`, `bg-card`) — see `docs/design-system.md`

## Stack
- React 18 + TypeScript, Vite, Tailwind CSS 3.4
- shadcn/ui components (Button, Card, Badge, Table, Tabs, Dialog, Form, Select, etc.)
- TanStack Query v5 for data fetching (`useQuery({ queryKey: ["/api/..."] })`)
- Wouter for routing (`useLocation`, `Link`)
- Lucide React for icons (no emoji)
- Recharts for charts

## Rules
- Files under 200 lines — split into sub-components if needed
- `data-testid` on all interactive and key display elements
- No `import React` (Vite JSX transform)
- No `hover:bg-*` on Button/Badge — use built-in variants
- Forms: `useForm` + `zodResolver` from `@/components/ui/form`
- Mutations: `apiRequest("POST", "/api/...", data)` from `@/lib/queryClient`
- Loading states: Skeleton components during data fetch
- Responsive: mobile-first, test at 375px/768px/1024px

## Task
Design and implement: $ARGUMENTS

Read existing pages in `client/src/pages/` for pattern reference before coding.
