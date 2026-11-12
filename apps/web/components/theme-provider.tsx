"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Light or dark for the landing page: follows the system until the visitor picks one with the
// header's sun/moon button (remembered in this browser). It sets data-theme on <html>; only the
// landing page's styles read it, so the rest of the app keeps its own look.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem enableColorScheme={false} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
