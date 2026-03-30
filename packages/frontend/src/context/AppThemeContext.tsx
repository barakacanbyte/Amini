"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ThemeMode = "light" | "dark";

type AppThemeContextValue = {
  mounted: boolean;
  resolvedTheme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);
const STORAGE_KEY = "amini-theme";

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme: ThemeMode = stored === "dark" || stored === "light"
      ? stored
      : systemPrefersDark
        ? "dark"
        : "light";

    setResolvedTheme(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);
  }, []);

  const setTheme = useCallback((theme: ThemeMode) => {
    setResolvedTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const value = useMemo(
    () => ({ mounted, resolvedTheme, setTheme, toggleTheme }),
    [mounted, resolvedTheme, setTheme, toggleTheme]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }
  return context;
}
