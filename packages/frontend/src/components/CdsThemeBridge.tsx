"use client";

import { ThemeProvider as CdsThemeProvider } from "@coinbase/cds-web";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { aminiCdsTheme } from "@/theme/aminiCdsTheme";

/**
 * Syncs CDS `ThemeProvider` with `next-themes` so CDS components pick light/dark tokens.
 */
export function CdsThemeBridge({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeColorScheme = !mounted
    ? "light"
    : resolvedTheme === "dark"
      ? "dark"
      : "light";

  return (
    <CdsThemeProvider theme={aminiCdsTheme} activeColorScheme={activeColorScheme}>
      {children}
    </CdsThemeProvider>
  );
}
