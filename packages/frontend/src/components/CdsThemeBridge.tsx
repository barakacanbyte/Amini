"use client";

import { ThemeProvider as CdsThemeProvider } from "@coinbase/cds-web/system";
import { useAppTheme } from "@/context/AppThemeContext";
import { aminiCdsTheme } from "@/theme/aminiCdsTheme";
import type { ReactNode } from "react";

/**
 * Syncs CDS `ThemeProvider` with the app theme context so CDS components pick light/dark tokens.
 */
export function CdsThemeBridge({ children }: { children: ReactNode }) {
  const { mounted, resolvedTheme } = useAppTheme();

  const activeColorScheme = mounted && resolvedTheme === "dark" ? "dark" : "light";

  return (
    <CdsThemeProvider theme={aminiCdsTheme} activeColorScheme={activeColorScheme}>
      {children}
    </CdsThemeProvider>
  );
}
