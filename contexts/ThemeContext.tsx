import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'biocontrol_theme';

function getPreferredTheme(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;

  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  return prefersDark ? 'dark' : 'light';
}

function applyThemeToDom(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
  // Ayuda a que inputs/scrollbars del navegador se adapten mejor.
  document.documentElement.style.colorScheme = theme;
}

export const ThemeProvider = ({ children }: { children?: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeMode>('light');

  useEffect(() => {
    const initial = getPreferredTheme();
    setThemeState(initial);
    applyThemeToDom(initial);
  }, []);

  const setTheme = (next: ThemeMode) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyThemeToDom(next);
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};

