/**
 * Coinbase Design System theme with Amini palette (emerald primary, brown accents).
 * Replaces CDS default blue `fgPrimary` / `bgPrimary` with brand green; maps blue accent
 * slots to brown so no Coinbase blue leaks into components.
 */
import type { ThemeConfig } from "@coinbase/cds-web";
import { defaultTheme } from "@coinbase/cds-web/themes/defaultTheme";

const emerald = {
  primary: "rgb(16, 185, 129)",
  primaryHover: "rgb(13, 150, 105)",
  washLight: "rgb(236, 253, 245)",
  washDark: "rgb(6, 78, 59)",
  subtleLight: "rgb(110, 231, 183)",
  subtleDark: "rgb(52, 211, 153)",
  fgLight: "rgb(16, 185, 129)",
  fgDark: "rgb(52, 211, 153)",
} as const;

const brown = {
  boldLight: "rgb(123, 74, 45)",
  boldDark: "rgb(210, 160, 124)",
  subtleLight: "rgb(245, 235, 230)",
  subtleDark: "rgb(55, 45, 40)",
} as const;

export const aminiCdsTheme: ThemeConfig = {
  ...defaultTheme,
  id: "amini-cds",
  lightColor: {
    ...defaultTheme.lightColor,
    fgPrimary: emerald.fgLight,
    bgPrimary: emerald.primary,
    bgPrimaryWash: emerald.washLight,
    bgLinePrimary: emerald.primary,
    bgLinePrimarySubtle: emerald.subtleLight,
    accentBoldBlue: brown.boldLight,
    accentSubtleBlue: brown.subtleLight,
  },
  darkColor: {
    ...defaultTheme.darkColor,
    fgPrimary: emerald.fgDark,
    bgPrimary: emerald.primary,
    bgPrimaryWash: emerald.washDark,
    bgLinePrimary: emerald.primary,
    bgLinePrimarySubtle: emerald.subtleDark,
    accentBoldBlue: brown.boldDark,
    accentSubtleBlue: brown.subtleDark,
  },
};
