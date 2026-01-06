import { useState, useEffect, useCallback, useRef } from 'react';
import { storageService } from '@/lib/storageService';

/**
 * Hook for config that syncs with storageService
 * Falls back to localStorage for compatibility
 */
export function useConfig<T>(initialValue: T): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const isInitialMount = useRef(true);

  // Load from storage on mount
  useEffect(() => {
    const load = async () => {
      try {
        await storageService.init();
        const stored = await storageService.getConfig<T>();
        if (stored !== null) {
          setValue(stored);
        } else {
          // Fallback: check localStorage for migration
          const local = localStorage.getItem('openchat-config');
          if (local) {
            const parsed = JSON.parse(local) as T;
            setValue(parsed);
            // Migrate to storageService
            await storageService.saveConfig(parsed);
          }
        }
      } catch (e) {
        console.error('Failed to load config:', e);
        // Fallback to localStorage
        const local = localStorage.getItem('openchat-config');
        if (local) setValue(JSON.parse(local));
      }
      setIsLoaded(true);
    };
    load();
  }, []);

  // Save to storage when value changes (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!isLoaded) return;

    // Save to both storageService and localStorage (backup)
    storageService.saveConfig(value).catch(console.error);
    localStorage.setItem('openchat-config', JSON.stringify(value));
  }, [value, isLoaded]);

  const setValueAndPersist = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(prev) 
        : newValue;
      return next;
    });
  }, []);

  return [value, setValueAndPersist, isLoaded];
}
