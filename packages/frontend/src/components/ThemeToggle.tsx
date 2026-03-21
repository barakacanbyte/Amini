"use client";

import { Button } from "@coinbase/cds-web/buttons/Button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/** Square icon control to align with header `compact` CDS buttons (40×40, 12px radius). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const shared = {
    variant: "secondary" as const,
    compact: true,
    font: "label1" as const,
    className:
      "h-10 w-10 min-h-10 min-w-10 max-w-10 shrink-0 !rounded-full !p-0 [&>span]:flex [&>span]:h-full [&>span]:w-full [&>span]:items-center [&>span]:justify-center",
  };

  if (!mounted) {
    return (
      <Button {...shared} disabled accessibilityLabel="Toggle theme">
        ◐
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      {...shared}
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? "☀" : "☾"}
    </Button>
  );
}
