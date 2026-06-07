'use client';

/**
 * Theme + Tweaks provider.
 *
 * Ports the appearance logic from the design's app.jsx:
 *  - light/dark theme via the `data-theme` attribute on <html>
 *  - accent color via the --brand / --brand-strong CSS variables
 *  - density via the `data-density` attribute
 *
 * All preferences persist to localStorage so they survive reloads.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/** Accent options → [--brand, --brand-strong]. */
export const ACCENTS: Record<string, [string, string]> = {
  '#1192e8': ['#1192e8', '#0072c3'], // cyan (default)
  '#0f62fe': ['#0f62fe', '#0043ce'], // blue
  '#009d9a': ['#009d9a', '#005d5d'], // teal
  '#6929c4': ['#6929c4', '#491d8b'], // purple
};

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfy';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accent: string;
  setAccent: (a: string) => void;
  density: Density;
  setDensity: (d: Density) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** Reads a persisted value, falling back to a default during SSR. */
function persisted<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  return (localStorage.getItem(key) as T) || fallback;
}

/**
 * Provides theme/accent/density state to the whole app and reflects each
 * setting onto the document element so the ported CSS picks it up.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [accent, setAccentState] = useState<string>('#1192e8');
  const [density, setDensityState] = useState<Density>('compact');

  // Hydrate from localStorage on mount (client-only to avoid SSR mismatch).
  useEffect(() => {
    setThemeState(persisted<Theme>('pg-theme', 'light'));
    setAccentState(persisted<string>('pg-accent', '#1192e8'));
    setDensityState(persisted<Density>('pg-density', 'compact'));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pg-theme', theme);
  }, [theme]);

  useEffect(() => {
    const [b, bs] = ACCENTS[accent] ?? ACCENTS['#1192e8']!;
    document.documentElement.style.setProperty('--brand', b);
    document.documentElement.style.setProperty('--brand-strong', bs);
    localStorage.setItem('pg-accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    localStorage.setItem('pg-density', density);
  }, [density]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: setThemeState,
        accent,
        setAccent: setAccentState,
        density,
        setDensity: setDensityState,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

/** Access the theme/tweaks context. Throws if used outside the provider. */
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
