import type { Theme } from "@coinbase/cdp-react";

/**
 * Matches Coinbase CDP React docs `Partial<Theme>` example so sign-in UI tokens align with the official embedded wallet look.
 */
export const cdpEmbeddedWalletTheme: Partial<Theme> = {
  "colors-bg-default": "#ffffff",
  "colors-bg-alternate": "#eef0f3",
  "colors-bg-primary": "#0052ff",
  "colors-bg-secondary": "#eef0f3",
  "colors-fg-default": "#0a0b0d",
  "colors-fg-muted": "#5b616e",
  "colors-fg-primary": "#0052ff",
  "colors-fg-onPrimary": "#ffffff",
  "colors-fg-onSecondary": "#0a0b0d",
  "colors-fg-positive": "#098551",
  "colors-fg-negative": "#cf202f",
  "colors-fg-warning": "#ed702f",
  "colors-line-default": "#dcdfe4",
  "colors-line-heavy": "#9397a0",
  "borderRadius-banner": "var(--cdp-web-borderRadius-xl)",
  "borderRadius-cta": "var(--cdp-web-borderRadius-full)",
  "borderRadius-link": "var(--cdp-web-borderRadius-full)",
  "borderRadius-input": "var(--cdp-web-borderRadius-lg)",
  "borderRadius-select-trigger": "var(--cdp-web-borderRadius-lg)",
  "borderRadius-select-list": "var(--cdp-web-borderRadius-lg)",
  "borderRadius-modal": "var(--cdp-web-borderRadius-xl)",
};
