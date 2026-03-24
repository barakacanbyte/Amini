# Amini Frontend Design System & Guidelines

This document outlines the core design principles and component guidelines for the Amini frontend, ensuring consistency across all pages.

## Layout & Containers

The application follows a unified "floating card" layout style on a dark background, established by the landing page and adopted by internal pages like Campaign Creation.

### Main Page Structure
Pages should generally follow this structure:
```tsx
<main className="app-page px-4 py-8 md:px-8">
  <div className="app-surface mx-auto max-w-6xl overflow-hidden rounded-[28px]">
    <section className="px-6 pb-8 pt-10 md:px-10 md:pb-10 md:pt-12">
      {/* Page Content */}
    </section>
  </div>
</main>
```

**Key Classes:**
- `app-page`: Sets the dark canvas background (`var(--ui-bg)`) and minimum 100vh height.
- `app-surface`: Provides the main raised surface (`var(--ui-surface)`), signature `rounded-[28px]` corners, border, and deep shadow.
- `app-surface-elev`: Used for nested cards or elevated elements within the main surface.

## Typography

We use a combination of custom thematic classes and components from the Coinbase Design System (CDS).

**Headlines:**
Pages usually feature a two-part centered headline:
```tsx
<div className="mx-auto flex max-w-4xl flex-col items-center text-center mb-10">
  <TextLabel2 as="p" className="brand-brown block w-full uppercase tracking-[0.18em]">
    Amini Impact Layer
  </TextLabel2>
  <TextTitle1 as="h1" className="app-text mt-4 block w-full text-4xl font-bold leading-[1.1] tracking-tight">
    Create <span className="brand-green">Amini Campaign</span>
  </TextTitle1>
</div>
```

**Text Colors:**
- `app-text`: Primary text color (adapts to light/dark).
- `app-muted`: Secondary/muted text.
- `brand-green`: Primary accent color (#10b981).
- `brand-brown`: Secondary accent color (#7b4a2d).
- `brand-amber`: Tertiary accent color (#d4a853).

## Coinbase CDS Components

We heavily leverage `@coinbase/cds-web` for consistent typography, loaders, tags, and interactive elements.

### Available CDS Imports
When building new forms or views, prefer CDS over custom HTML elements where appropriate:

**Typography:**
```tsx
import { TextTitle1 } from "@coinbase/cds-web/typography/TextTitle1";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextLabel1 } from "@coinbase/cds-web/typography/TextLabel1";
import { TextLabel2 } from "@coinbase/cds-web/typography/TextLabel2";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
```

**Feedback & Visualization:**
```tsx
import { Tag } from "@coinbase/cds-web/tag/Tag";
import { Spinner } from "@coinbase/cds-web/loaders/Spinner";
import { ProgressBar } from "@coinbase/cds-web/visualizations/ProgressBar";
```

## Creating Forms (Campaign Create Example)

When creating forms inside the `app-surface`:
- Avoid creating full-bleed white backgrounds that clash with the dark canvas.
- Nest form sections inside `.campaign-card` or equivalent elevated panels (`app-surface-elev`).
- Use custom toggle switches (`.campaign-toggle`) and styled inputs (`.campaign-input`, `.campaign-select`) provided in `globals.css` to maintain the thematic feel.

## System UI Aesthetics

To ensure maximum clarity and a premium feel, the following rules are enforced:

### Form Inputs
- **Light Theme Only**: All `input`, `textarea`, and `select` elements maintain a light/white background and dark text across both light and dark modes. This ensures focus and readability during data entry.
- **Focus Rings**: Interactive elements utilize `--ui-focus-ring` (a soft emerald glow).

### Banners & Notifications
- **Internal Padding**: Contextual banners (`Banner` component from CDS) are styled with `0.75rem 1.25rem` internal padding to prevent text from touching the edges of the colored background.

### Review Steps
- **High Contrast**: The "Review & Launch" step utilizes `bg-[var(--ui-surface-elev)]/30` background overlays for sections, `brand-green` font-bold headers, and high-contrast labels for clear information hierarchy.

## Dark Mode
The application supports both light and dark modes through CSS variables defined in `globals.css` under the `:root` and `.dark` selectors. Do not hardcode hex colors (e.g., `#ffffff` or `#000000`) for structural elements; always use the `var(--ui-*)` tokens. Exception: Form inputs are explicitly white for visual clarity.

