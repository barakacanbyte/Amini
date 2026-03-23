"use client";

import { Button } from "@coinbase/cds-web/buttons/Button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Square icon control to align with header `compact` CDS buttons (40×40, circular). */
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
      "flex items-center justify-center shrink-0 !h-10 !w-10 !min-h-10 !min-w-[40px] !max-w-[40px] !p-0 !rounded-full border dark:border-[var(--ui-border)] dark:hover:bg-[var(--ui-surface-elev)] hover:bg-gray-100 transition-colors [&>span]:flex [&>span]:h-full [&>span]:w-full [&>span]:items-center [&>span]:justify-center",
  };

  if (!mounted) {
    return (
      <Button {...shared} disabled accessibilityLabel="Toggle theme">
        <div className="h-4 w-4 bg-transparent" />
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
      {isDark ? (
        <Sun className="h-5 w-5 text-gray-500 dark:text-gray-400" />
      ) : (
        <Moon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
      )}
    </Button>
  );
}
