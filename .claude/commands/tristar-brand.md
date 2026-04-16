# Tristar Brand Guidelines

Enforce Tristar Physical Therapy brand standards when editing any UI component.

## Brand Colors (use CSS tokens, never raw hex)
- Primary (light): `hsl(var(--primary))` — Orange #FF8200
- Primary (dark): `hsl(var(--primary))` — shifts to blue automatically
- Background: `bg-background` (white light / black dark)
- Cards: `bg-card` (off-white light / dark blue-gray dark)
- Text: `text-foreground` (near-black light / light-gray dark)
- Muted: `text-muted-foreground` for secondary text
- Destructive: `hsl(var(--destructive))` for errors/deletions
- Chart colors: `chart-1` (blue), `chart-2` (teal), `chart-3` (gold), `chart-4` (green), `chart-5` (pink)

## Typography
- Body: DM Sans (`font-sans`) — 14-16px
- Headings: Montserrat (`font-heading`) — use `font-heading` class on h1-h6
- Mono: JetBrains Mono (`font-mono`) — code, IDs, account numbers
- Heading weight: `font-semibold` (600) with `tracking-tight`

## Component Rules
- Use shadcn/ui components (Button, Card, Badge, etc.) — no custom reimplementations
- No emoji as icons — use Lucide React only
- No `hover:bg-*` or `active:bg-*` on Button or Badge — use built-in variants
- Cards: never nest inside other cards
- Border radius: `rounded-lg` (0.75rem) — tighter, professional
- `data-testid` on all interactive elements

## When editing $ARGUMENTS:
1. Check all color values use CSS tokens, not raw hex
2. Verify headings use `font-heading` class
3. Ensure shadcn components used instead of raw HTML
4. Confirm no emoji icons
5. Check `data-testid` present on interactive elements
