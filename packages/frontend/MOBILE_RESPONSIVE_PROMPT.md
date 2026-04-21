# Mobile-Responsive Refactor Prompt (Amini Frontend)

Copy everything below the `---` into a new chat, and append the target page(s) / component(s) you want refactored at the bottom under **TARGET**. Work on **one page or component at a time**.

---

You are refactoring the Amini frontend (`packages/frontend`, Next.js 16 App Router, React 19, Tailwind CSS v4, TypeScript) to be fully responsive on mobile **without changing desktop visuals, behavior, or the design system**. This is a surgical, visual-only change. Do **not** refactor business logic, rename props, change data fetching, change routes, or alter component APIs.

## Non-negotiable constraints

1. **Design system must be preserved.** The project uses `@coinbase/cds-web` (`Button`, `HStack`, `Dropdown`, `MenuItem`, `Icon`, typography: `TextTitle1`, `TextTitle2`, `TextBody`, `TextCaption`, `TextLabel2`) and `@coinbase/onchainkit`. Do **not** replace CDS components with raw HTML or a different UI library. Keep all existing props; only add responsive className tweaks or wrappers.
2. **Theme tokens only.** Colors, surfaces, borders, focus rings must come from the existing CSS variables and utility classes defined in `src/app/globals.css`:
   - CSS vars: `--ui-bg`, `--ui-surface`, `--ui-surface-elev`, `--ui-border`, `--ui-text`, `--ui-muted`, `--ui-brand-green`, `--ui-brand-green-strong`, `--ui-brand-brown`, `--ui-brand-brown-soft`, `--ui-brand-amber`, `--ui-focus-ring`, `--ui-shadow-lg`, `--ui-shadow-md`.
   - Utility classes: `app-root`, `app-page`, `app-surface`, `app-surface-elev`, `app-text`, `app-muted`, `brand-green`, `brand-brown`, `focus-brand`.
   Never hardcode hex colors. Never introduce new CSS vars for this task.
3. **Dark mode must keep working.** Dark mode is toggled via `.dark` on `<html>` (`next-themes`). Verify every change still reads the CSS vars and visually works in both themes.
4. **Breakpoints (Tailwind v4 defaults, already used in codebase):**
   - `< 640px` → mobile (default, unprefixed classes)
   - `sm:` ≥ 640px
   - `md:` ≥ 768px (tablet)
   - `lg:` ≥ 1024px (desktop — **do not alter this layer visually**)
   - `xl:` ≥ 1280px
   Mobile-first: unprefixed classes target mobile; existing `sm:`/`md:`/`lg:` classes that produce the current desktop look must be preserved.
5. **No regressions ≥ 1024px.** Everything currently visible on `lg+` must render pixel-equivalently after the change. If a desktop style needs to stay, gate new mobile rules behind defaults and let `lg:` restore the desktop rule.
6. **Accessibility:**
   - Tap targets ≥ 44×44 px on mobile.
   - Keep existing `aria-label`, `aria-haspopup`, `focus-brand` classes, and focus rings.
   - Any new interactive element (hamburger, drawer, close button) must have an `aria-label`, be keyboard-operable (Esc closes drawer), and trap focus while open.
   - Respect `prefers-reduced-motion` for any added transitions.
7. **Images:** Keep `next/image` usage. If you touch a `fill` image, preserve/adjust the `sizes` attribute correctly for the new responsive widths.
8. **No new dependencies** unless absolutely required. Prefer Tailwind utilities + a small local `useState` for drawer toggles. Icons come from `lucide-react` (already installed).
9. **No comments added/removed** unless the user explicitly asks.
10. **Edits must be minimal and localized.** Prefer editing existing files with `edit`/`multi_edit`. Do not create new files unless a drawer/topbar component is genuinely needed and reused in >1 place.

## Mobile patterns to apply

Apply the following patterns as relevant to the target. Only apply what the target actually needs — don't over-engineer.

### Layout & spacing

- Outer page wrappers: ensure horizontal padding scales — `px-4 sm:px-6 md:px-8` (already the house style).
- Containers: keep `mx-auto max-w-6xl` / `max-w-7xl`; do **not** tighten.
- Card inner padding: `p-4 sm:p-6 md:p-8` (or existing `px-6 md:px-10` patterns — match the file).
- Vertical rhythm: `py-6 sm:py-8 md:py-10` style scaling.
- **Never** allow horizontal overflow. Add `min-w-0` to flex/grid children that contain long strings (addresses, org names, tx hashes); combine with `truncate` or `break-all` for hex strings.

### Typography

- Scale headings down on mobile: e.g., `text-3xl sm:text-4xl md:text-5xl lg:text-6xl`. Match the nearest existing pattern; do not introduce new sizes.
- Body text stays `text-sm`/`text-base`; do not shrink below `text-sm` on mobile.

### Grids & flex

- Convert desktop multi-column grids to single column on mobile:
  - `grid-cols-[88px_1fr]` stays fine (already narrow-safe).
  - `lg:grid-cols-[1fr_1.2fr]` → already mobile-first single-column ✓.
  - Any `grid-cols-2`/`grid-cols-3` without a breakpoint → change to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (or similar) as appropriate.
- Button rows: ensure `flex-wrap` is on and buttons stretch with `w-full sm:w-auto` when there are ≥3 actions.

### Tables

- If you encounter a `<table>`, wrap it in `<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">` so it scrolls horizontally inside the card on mobile. Do **not** restructure into stacked cards unless the user requests it.

### Forms

- Inputs become full-width on mobile: `w-full sm:w-auto` on the field wrapper where appropriate.
- Two-column form rows: `grid-cols-1 md:grid-cols-2 gap-4`.
- Submit button row: `flex-col sm:flex-row gap-2 sm:gap-3`.

### Modals / dropdowns

- CDS `Dropdown` menus: ensure `min-w-[...]` values don't exceed `calc(100vw - 2rem)`. If a dropdown has `min-w-[240px]` keep it; if larger, cap with `max-w-[calc(100vw-2rem)]`.
- Any `fixed` overlays should use `inset-0` and `z-50+`.

## Special cases (these are known hot spots — handle them explicitly if in scope)

### `src/components/SiteHeader.tsx`

The header's action cluster (notifications, messages bell, `ThemeToggle`, "Start a campaign" button, `ProfileMenu`) currently never collapses; nav items wrap awkwardly below 768px.

Required mobile behavior:
- **< 768px (`md:`)**: hide the nav (`NAV_ITEMS`) and the "Start a campaign" `Button`. Show a hamburger button (use `Menu` from `lucide-react`) that opens a slide-in drawer (right or top) containing: the nav items, "Start a campaign" CTA, and links to `/messages`. Keep the logo, `ProfileMenu` avatar, and `ThemeToggle` visible in the compact bar. The notifications bell and messages link can move into the drawer if space is tight.
- **≥ 768px**: unchanged from current layout.
- Drawer must close on: route change (listen to `usePathname`), backdrop click, Esc key, and link click.
- Preserve the existing `sticky top-0 z-50` header and the `app-surface` inner container.

### `src/components/dashboard/Sidebar.tsx` + `src/components/dashboard/DashboardLayout.tsx`

The fixed `w-64` sidebar is always rendered side-by-side. Unusable on mobile.

Required mobile behavior:
- **< 1024px (`lg:`)**: hide the sidebar by default; render an off-canvas drawer version of the exact same sidebar content, slid in from the left, with a backdrop. Add a compact top bar inside `DashboardLayout` (only visible `< lg`) containing: hamburger toggle, Amini logo, and the role select (or move role select into the drawer). Keep the existing `<Sidebar>` implementation; reuse it inside the drawer — do not duplicate nav logic.
- **≥ 1024px**: current layout unchanged (`lg:flex`, `lg:w-64`, etc.).
- Main content: remove the rigid row flex on mobile; `DashboardLayout` becomes `flex-col lg:flex-row`. Main area inner padding: `p-4 sm:p-6 md:p-8 lg:p-10`.
- The drawer must close on route change, backdrop click, Esc, and any nav link click.

### Home page (`src/app/page.tsx`)

- Hero title already scales (`text-4xl sm:text-5xl md:text-6xl`) — keep.
- Hero image `aspect-[16/10] md:aspect-[21/9]` — keep.
- Action button row (`HStack` with 3 buttons): ensure on mobile they wrap full width; CDS `Button` with `compact` is fine, but wrap in a container with `flex-col sm:flex-row gap-2` if they overflow.
- Activity cards `grid-cols-[88px_1fr]`: on very small screens (< 380px), the 88px image column is acceptable — leave as-is unless content truncates badly.

## Workflow to follow (per target)

1. **Read** the target file(s) fully before editing.
2. **Inventory** every breakpoint-sensitive concern in the file: horizontal overflow risks, fixed widths, hidden actions, long strings, large headings, dense grids.
3. **Plan** the minimal set of className/markup changes. Draft them mentally before writing.
4. **Edit** with `edit`/`multi_edit` — change only classNames and add wrapper `<div>`s / drawer state where required. Do not rewrite the component.
5. **Verify** mentally at each breakpoint: 360, 390, 414, 640, 768, 1024, 1280 px widths, both light and dark themes.
6. **Report** what changed, which breakpoints you targeted, and any intentional trade-offs.

## QA checklist (must pass before declaring done)

- [ ] No horizontal scroll at 360 px width on the target page.
- [ ] All interactive elements ≥ 44×44 px on mobile.
- [ ] Header / sidebar drawer opens, closes (backdrop, Esc, route change, link click), and traps focus.
- [ ] Long wallet addresses / org names / tx hashes truncate, do not push layout.
- [ ] Images don't distort; `sizes` attribute updated if `fill` layout bounds changed.
- [ ] Dark mode looks correct at 360, 768, 1024 px.
- [ ] Desktop ≥ 1024 px is visually identical to before.
- [ ] No new dependencies added. No CDS components replaced. No CSS vars added.
- [ ] No TypeScript errors. No new lint warnings.
- [ ] No unrelated code, comment, or formatting changes.

## Output format

- A short summary of the diagnosis (what was broken on mobile).
- The minimal edits applied, referenced with file paths and line ranges.
- A per-breakpoint description of the resulting behavior.
- A completed QA checklist.

---

**TARGET:** <paste the file path(s) or page route here, e.g. `src/app/campaigns/page.tsx` — work on this target only>
