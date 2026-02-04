import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // Initialize from localStorage only once
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;

      // Reviver function to convert date strings back to Date objects
      const reviver = (_key: string, value: unknown) => {
        if (typeof value === 'string' &&
          (_key === 'createdAt' || _key === 'updatedAt' || _key === 'timestamp')) {
          const date = new Date(value);
          return isNaN(date.getTime()) ? value : date;
        }
        return value;
      };

      return JSON.parse(item, reviver);
    } catch (error) {
      logger.error('localStorage read error:', error);
      return initialValue;
    }
  });

  // Debounce timer ref
  const timeoutRef = useRef<number | null>(null);
  const pendingValueRef = useRef<T>(storedValue);

  // Debounced write to localStorage
  useEffect(() => {
    pendingValueRef.current = storedValue;

    // Clear existing timeout
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    // Debounce writes by 300ms
    timeoutRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(pendingValueRef.current));
      } catch (error) {
        logger.error('localStorage write error:', error);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [key, storedValue]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        try {
          window.localStorage.setItem(key, JSON.stringify(pendingValueRef.current));
        } catch (error) {
          logger.error('localStorage flush error:', error);
        }
      }
    };
  }, [key]);

  return [storedValue, setStoredValue];
}