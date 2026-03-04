# Tristar 360° Design System

## Color Palette

All colors are defined as CSS custom properties in `client/src/index.css` using the `H S% L%` format (space-separated, no `hsl()` wrapper) and consumed in Tailwind via `hsl(var(--token) / <alpha-value>)`.

### Light Mode (`:root`)

| Token | HSL Value | Role |
|---|---|---|
| `--background` | `0deg 0% 100%` | Page background (white) |
| `--foreground` | `210 25% 7.84%` | Default text (near-black) |
| `--border` | `201.43 30.43% 90.98%` | General borders |
| `--card` | `180 6.67% 97.06%` | Card surface (off-white) |
| `--card-foreground` | `210 25% 7.84%` | Card text |
| `--card-border` | `200 20% 94%` | Card border |
| `--primary` | `30.59deg 100% 50%` | Brand orange — CTAs, focus rings |
| `--primary-foreground` | `0 0% 100%` | Text on primary (white) |
| `--secondary` | `210 25% 7.84%` | Dark secondary surface |
| `--secondary-foreground` | `0 0% 100%` | Text on secondary (white) |
| `--muted` | `240 1.96% 90%` | Muted backgrounds, zebra rows |
| `--muted-foreground` | `210 25% 7.84%` | Subdued text |
| `--accent` | `211.58 51.35% 92.75%` | Accent highlight (light blue) |
| `--accent-foreground` | `30deg 100% 91.76%` | Accent text |
| `--destructive` | `356.3deg 90.56% 54.31%` | Error / destructive red |
| `--destructive-foreground` | `0 0% 100%` | Text on destructive |
| `--input` | `200 23.08% 97.45%` | Input field background |
| `--ring` | `30.59deg 100% 50%` | Focus ring (matches primary) |

### Dark Mode (`.dark`)

| Token | HSL Value | Role |
|---|---|---|
| `--background` | `0 0% 0%` | Page background (black) |
| `--foreground` | `200 6.67% 91.18%` | Default text (light gray) |
| `--border` | `210 5.26% 14.90%` | Borders (dark gray) |
| `--card` | `228 9.80% 10%` | Card surface (dark blue-gray) |
| `--card-foreground` | `0 0% 85.10%` | Card text |
| `--primary` | `203.77 87.60% 52.55%` | Primary shifts to blue in dark mode |
| `--secondary` | `195 15.38% 94.90%` | Light secondary surface |
| `--secondary-foreground` | `210 25% 7.84%` | Dark text on secondary |
| `--muted` | `0 0% 9.41%` | Muted surface (near-black) |
| `--muted-foreground` | `210 3.39% 46.27%` | Subdued text |
| `--accent` | `205.71 70% 7.84%` | Dark accent blue |
| `--input` | `207.69 27.66% 18.43%` | Input background |
| `--ring` | `202.82 89.12% 53.14%` | Focus ring (blue) |

### Sidebar Colors

| Token | Light | Dark |
|---|---|---|
| `--sidebar` | `180 6.67% 97.06%` | `228 9.80% 10%` |
| `--sidebar-foreground` | `210 25% 7.84%` | `0 0% 85.10%` |
| `--sidebar-border` | `205 25% 90.59%` | `205.71 15.79% 26.08%` |
| `--sidebar-primary` | `203.89 88.28% 53.14%` | `202.82 89.12% 53.14%` |
| `--sidebar-accent` | `211.58 51.35% 92.75%` | `205.71 70% 7.84%` |

### Chart Colors

Five chart colors are defined for data visualization consistency:

| Token | HSL Value | Approximate Color |
|---|---|---|
| `--chart-1` | `203.89 88.28% 53.14%` | Blue |
| `--chart-2` | `159.78 100% 36.08%` | Teal/Green |
| `--chart-3` | `42.03 92.83% 56.27%` | Gold/Yellow |
| `--chart-4` | `147.14 78.50% 41.96%` | Green |
| `--chart-5` | `341.49 75.20% 50.98%` | Pink/Rose |

### Status Colors (hardcoded RGB in Tailwind config)

| Token | RGB | Use |
|---|---|---|
| `status-online` | `rgb(34 197 94)` | Online indicator |
| `status-away` | `rgb(245 158 11)` | Away indicator |
| `status-busy` | `rgb(239 68 68)` | Busy indicator |
| `status-offline` | `rgb(156 163 175)` | Offline indicator |

### Elevation System

Interactive elevation uses semi-transparent overlays rather than explicit color swaps:

| Variable | Light | Dark |
|---|---|---|
| `--elevate-1` | `rgba(0,0,0, .03)` | `rgba(255,255,255, .04)` |
| `--elevate-2` | `rgba(0,0,0, .08)` | `rgba(255,255,255, .09)` |
| `--button-outline` | `rgba(0,0,0, .10)` | `rgba(255,255,255, .10)` |
| `--badge-outline` | `rgba(0,0,0, .05)` | `rgba(255,255,255, .05)` |

Border colors for opaque buttons auto-derive from their fill via `hsl(from ... calc(l + var(--opaque-button-border-intensity)))`:
- Light mode: `--opaque-button-border-intensity: -8` (darker border)
- Dark mode: `--opaque-button-border-intensity: 9` (lighter border)

## Typography

### Font Families

| Token | Light Mode | Dark Mode | Tailwind Class |
|---|---|---|---|
| `--font-sans` | Montserrat, sans-serif | Open Sans, sans-serif | `font-sans` |
| `--font-serif` | Georgia, serif | Georgia, serif | `font-serif` |
| `--font-mono` | Menlo, monospace | Menlo, monospace | `font-mono` |

The body applies `font-sans antialiased` globally.

### Text Hierarchy

Three levels of text color convey information hierarchy:

| Level | Class | Purpose |
|---|---|---|
| Default | `text-foreground` (implicit) | Primary content, headings |
| Secondary | `text-muted-foreground` | Supporting info, labels, subtitles |
| Tertiary | `text-muted-foreground` at reduced opacity | Least important metadata |

### Page Headers

A `.page-header` utility class provides standardized title blocks:
- `h1`: 1.25rem (mobile) → 1.5rem (sm+), `font-weight: 700`
- `.page-subtitle`: 0.8125rem (~13px), `color: muted-foreground`
- Flexbox with `justify-content: space-between` and `gap: 0.75rem`

### Table Headers

`thead th` elements are globally styled:
- `font-size: 0.75rem` (12px), uppercase, letter-spacing `0.025em`
- Color: `muted-foreground`
- Background: `muted` at 50% opacity (light) / 40% (dark)

## Border Radius

Configured in `tailwind.config.ts`:

| Class | Value |
|---|---|
| `rounded-sm` | 0.1875rem (3px) |
| `rounded-md` | 0.375rem (6px) |
| `rounded-lg` | 0.5625rem (9px) |

The CSS variable `--radius: 1.3rem` is available but the Tailwind config overrides with the values above. Borders should always be small (`rounded-md`) unless creating circles or pills.

## Spacing

`--spacing: 0.25rem` (4px base unit). Tailwind's default spacing scale applies.

## Component Usage Guidelines

### Buttons (`@/components/ui/button`)

Size variants and their heights:

| Size | Min Height | Use Case |
|---|---|---|
| `default` | `min-h-9` | Standard actions |
| `sm` | `min-h-8` | Compact contexts |
| `lg` | `min-h-10` | Prominent actions |
| `icon` | `h-9 w-9` | Icon-only buttons |

Variant options: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`.

Rules:
- Never manually set padding, height, or width on Buttons (use size variants)
- `size="icon"` must never have `h-*` or `w-*` classes added
- Hover/active states are built-in via `hover-elevate` and `active-elevate-2` — never add `hover:bg-*` to Buttons
- Sibling interactive controls on the same line must have matching heights

### Cards (`@/components/ui/card`)

- Use for grouping related content with subtle background elevation
- Never nest a Card inside another Card
- Never use Cards as full-width/height sidebar or header panels (rounded corners would touch edges)
- Rounded elements must always have padding in their container

### Badges (`@/components/ui/badge`)

- Use `size="sm"` (smaller than interactive controls)
- Content never wraps; overflow is hidden
- Hover/active states are built-in — never add custom hover styles
- Place in locations with sufficient room to grow in width

### Forms

- Use `useForm` from `@/components/ui/form` (wraps `react-hook-form`)
- Validate with `zodResolver` using insert schemas from `@shared/schema.ts`
- Always pass default values to `useForm`

### Inputs

- `Textarea` must retain its default padding (never apply `p-0`)
- Inputs with embedded icons should have small spacing on left and right

### Avatars

- Use shadcn `Avatar`, `AvatarImage`, `AvatarFallback` for all profile pictures

### Select

- `<SelectItem>` must always have a `value` prop

### Tables

- Zebra striping is applied globally via `tbody tr:nth-child(even)` at `muted/35%` (light) / `muted/25%` (dark)
- Custom thin scrollbars on `.overflow-x-auto` and `.overflow-auto` containers

## Layout Patterns

### App Shell

```
SidebarProvider
  └─ div.flex.h-screen.w-full
       ├─ AppSidebar (collapsible, 16rem / 3rem icon mode)
       └─ div.flex.flex-col.flex-1.min-w-0
            ├─ header (h-12, sticky, z-50, border-b)
            │    ├─ SidebarTrigger
            │    ├─ GlobalSearch
            │    └─ ThemeToggle
            └─ main.flex-1.overflow-auto
                 └─ <Router />
```

### Sidebar

Uses shadcn `Sidebar` primitives from `@/components/ui/sidebar`:
- `SidebarProvider` — wraps app, accepts `--sidebar-width` CSS var
- `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`
- `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`
- `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`
- `SidebarMenuSub`, `SidebarMenuSubButton`, `SidebarMenuSubItem`
- Collapsible sections via `Collapsible` / `CollapsibleContent` / `CollapsibleTrigger`

Navigation groups: Core (Dashboard, Providers, etc.), Operations (Goals, Tiering, Tasks), Dashboards (Executive, Territory, Location), Finance (Unit Economics), Revenue Recovery, Admin.

Width set via CSS custom properties on `SidebarProvider`:
```tsx
const style = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};
```

### Dashboard Grids

Stat cards use responsive CSS grid:
```
grid grid-cols-2 md:grid-cols-4 gap-3
```

Dashboard pages typically follow:
1. Page header (`.page-header` with title + filters)
2. Stat cards row
3. Charts / data tables in card containers

### Authenticated Layout

- `AuthProvider` wraps the app providing `useAuth()` context
- Unauthenticated users see `LoginPage` or `ResetPasswordPage`
- Authenticated users get the full sidebar + router layout
- `ForcePasswordChange` dialog shown when `user.forcePasswordChange` is true
- `IdleTimeout` component handles session timeout

## Icon Usage

All icons come from `lucide-react`. Common icons used across the app:

| Icon | Context |
|---|---|
| `LayoutDashboard` | Dashboard nav |
| `Stethoscope` | Referring providers |
| `MessageSquare` | Interactions |
| `FileText` | Patients / referrals / claims |
| `ClipboardList` | Tasks |
| `Calendar` | Calendar |
| `Settings` | Settings |
| `Users` | User management |
| `Target` | Goals / targets |
| `DollarSign` | Financial / unit economics |
| `TrendingUp` / `TrendingDown` | Trend indicators |
| `AlertTriangle` | Alerts / warnings |
| `Award` | Tiering |
| `Map` / `MapPin` | Map view / locations |
| `Upload` | Import actions |
| `Loader2` | Loading spinners (with `animate-spin`) |
| `ChevronDown` / `ChevronRight` | Expand/collapse indicators |
| `ArrowUpRight` / `ArrowDownRight` | Positive/negative change |
| `Zap` | Quick actions |
| `Trophy` | Leaderboard |
| `Activity` | Activity feed |
| `Plug` | Integrations |

Company/brand logos use `react-icons/si`.

## Responsive Breakpoints

Standard Tailwind breakpoints apply:

| Breakpoint | Min Width | Usage |
|---|---|---|
| `sm` | 640px | Page headers scale up, form layouts adjust |
| `md` | 768px | Dashboard grids go from 2 to 4 columns |
| `lg` | 1024px | Sidebar behavior changes |
| `xl` | 1280px | Wide layouts |
| `2xl` | 1536px | Extra-wide layouts |

The sidebar collapses to icon-only mode on smaller screens via `useSidebar()`.

## Dark Mode Implementation

### Mechanism

1. `darkMode: ["class"]` in `tailwind.config.ts`
2. `ThemeProvider` component manages state:
   - Stores `"light"` or `"dark"` in `localStorage` under key `"theme"`
   - Toggles `.dark` class on `document.documentElement`
   - Provides `useTheme()` hook with `{ theme, toggleTheme }`
3. `ThemeToggle` button in the app header triggers `toggleTheme()`

### Color Variable Strategy

All semantic colors are redefined in the `.dark` CSS class:
- Background shifts from white to black
- Cards shift from off-white to dark blue-gray (`228 9.80% 10%`)
- Primary shifts from orange (`30.59deg`) in light to blue (`203.77deg`) in dark
- Elevation overlays swap from black-on-light to white-on-dark
- Border intensity direction reverses (`-8` to `+9`)

### Best Practices

- Use semantic Tailwind classes (`bg-background`, `text-foreground`, `bg-card`) which auto-adapt
- When using literal colors, always include both light and dark variants: `className="bg-white dark:bg-black"`
- For hero images, apply a dark wash gradient so text remains readable in both modes
- Table zebra stripes and scrollbar colors adjust automatically via global CSS rules

## Interaction System

### Elevation Utilities (defined in `index.css`)

| Class | Effect |
|---|---|
| `hover-elevate` | Subtle background elevation on hover (`--elevate-1`) |
| `active-elevate-2` | More dramatic elevation on press/active (`--elevate-2`) |
| `toggle-elevate` | Prepares element for toggle state |
| `toggle-elevated` | Applies toggled-on elevation |
| `no-default-hover-elevate` | Removes built-in hover elevation |
| `no-default-active-elevate` | Removes built-in active elevation |

Rules:
- `hover-elevate` and `active-elevate-2` require `position: relative` (auto-applied) and must NOT be used with `overflow-hidden`
- `Button` and `Badge` already include elevation interactions — never add elevation classes to them
- The elevation system uses `::after` pseudo-elements with `z-index: 999`
- Toggle system uses `::before` pseudo-elements with `z-index: -1` (behind content)
- All elevations compose with any background color

## Data Test IDs

Every interactive and meaningful display element must have a `data-testid` attribute:

| Pattern | Example |
|---|---|
| Interactive: `{action}-{target}` | `button-submit`, `input-email`, `link-profile` |
| Display: `{type}-{content}` | `text-username`, `status-payment` |
| Dynamic: `{type}-{desc}-{id}` | `card-product-${id}`, `row-user-${index}` |

## Shadow System

Shadows are defined as CSS variables (`--shadow-2xs` through `--shadow-2xl`) but are currently set to `0.00` opacity — effectively invisible. The design favors a flat/bordered approach over drop shadows.

Drop shadows should only be used:
- On elements sharing the same background color as their container
- On floating elements (modals, toasts)
