import { useCallback, useEffect, useState } from 'react';

type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'color-scheme';

function getSystemScheme(): ColorScheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredScheme(): ColorScheme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function syncMetaTag(override: ColorScheme | null) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = override ?? 'light dark';
  }
}

export function useTheme() {
  const [override, setOverride] = useState<ColorScheme | null>(() => readStoredScheme());
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(() => getSystemScheme());

  const resolvedScheme: ColorScheme = override ?? systemScheme;

  useEffect(() => {
    syncMetaTag(override);
  }, [override]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = () => {
      // Never delete localStorage override when OS preference changes.
      setSystemScheme(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onMediaChange);

    const onStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setOverride(readStoredScheme());
      }
    };
    window.addEventListener('storage', onStorageChange);

    return () => {
      media.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    const currentSystem = getSystemScheme();
    const currentRendered = override ?? currentSystem;
    const target: ColorScheme = currentRendered === 'dark' ? 'light' : 'dark';

    if (target === currentSystem) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors; still update page scheme.
      }
      setOverride(null);
      syncMetaTag(null);
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, target);
      } catch {
        // Ignore storage errors; still update page scheme.
      }
      setOverride(target);
      syncMetaTag(target);
    }
  }, [override]);

  return {
    resolvedScheme,
    isOverridden: override !== null,
    toggleTheme,
  };
}

