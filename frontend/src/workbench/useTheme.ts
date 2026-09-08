import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'threadline:theme';

/**
 * The theme, remembered across restarts.
 *
 * Dark is the default rather than the system preference. The app is read for
 * hours at a stretch, often late, and the dark surface is the one that got
 * tuned — following a system setting would hand the user a surface nobody
 * designed for. An explicit choice is honoured and remembered.
 *
 * localStorage can throw: a webview with site data blocked rejects the read.
 * That is a reason to fall back to the default, not a reason to fail to start.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readStored);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // A preference that cannot be saved is a smaller problem than a crash.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return [theme, toggle];
}

function readStored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
