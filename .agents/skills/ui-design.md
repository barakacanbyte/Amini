# UI & Design System

## Coinbase Design System (CDS)

We use [Coinbase Design System (CDS)](https://cds.coinbase.com/) for the frontend UI, with **Amini's own branding** applied on top.

### Setup

- **Package:** `@coinbase/cds-web` (and `@coinbase/cds-icons`, `framer-motion` as peer).
- **Global styles** are imported in `src/app/layout.tsx`:
  - `@coinbase/cds-icons/fonts/web/icon-font.css`
  - `@coinbase/cds-web/globalStyles`
  - `@coinbase/cds-web/defaultFontStyles`
- **Providers** in `src/app/providers.tsx`:
  - `ThemeProvider` with `aminiTheme` (currently `defaultTheme`; overrides can be added in `src/theme/aminiTheme.ts`).
  - `MediaQueryProvider` for responsive behavior.

### Using CDS Components

- Prefer CDS layout (`Box`, `HStack`, `VStack`), typography (`Text`), and controls (`Button`, `TextInput`, etc.) from `@coinbase/cds-web` for consistency and accessibility.
- Apply Amini colors via the `--amini-*` variables (e.g. in `style` or by extending the theme in `src/theme/aminiTheme.ts` if you override CDS tokens).
- Component import paths follow CDS docs (e.g. `@coinbase/cds-web/layout/Box`, `@coinbase/cds-web/controls/Button`); check [CDS Installation](https://cds.coinbase.com/getting-started/installation) and [Theming](https://cds.coinbase.com/getting-started/theming) for the exact paths and theme shape.

## Amini Branding

The **palette** is exposed as CSS variables in `src/app/globals.css`:

| Variable | Value | Usage |
|---|---|---|
| `--amini-midnight` | `#1E1B4B` | Primary background, headers |
| `--amini-emerald` | `#10B981` | Trust, success |
| `--amini-amber` | `#F59E0B` | Activity, warnings |
| `--amini-cloud` | `#F9FAFB` | Content, cards |
| `--amini-slate` | `#334155` | Body text, UI |

- **Typography:** Inter (via Next.js font in layout). Manrope can be added as an alternative.
- Use these variables in custom components and where you override CDS so the app stays on-brand.

## Design Principles

- Clarity over complexity.
- Data visibility and strong visual trust indicators.
- Minimalist "blockchain explorer" aesthetic.
