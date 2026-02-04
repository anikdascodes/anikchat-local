import { createContext, useContext, useEffect, useState } from 'react';
import { logger } from '@/lib/logger';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const safeLocalStorageGet = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      logger.debug('localStorage get failed:', error);
      return null;
    }
  };

  const safeLocalStorageSet = (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      logger.debug('localStorage set failed:', error);
    }
  };

  const [theme, setTheme] = useState<Theme>(() => {
    const stored = safeLocalStorageGet('openchat-theme');
    return (stored as Theme) || 'dark';
  });

  useEffect(() => {
    safeLocalStorageSet('openchat-theme', theme);

    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
