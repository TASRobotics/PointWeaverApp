import { useEffect, useState } from 'react';
import type { Theme } from '../features/canvas/FieldCanvas';

const KEY = 'pw:theme';

const initial = (): Theme => {
  try {
    return localStorage.getItem(KEY) === 'day' ? 'day' : 'night';
  } catch {
    return 'night';
  }
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch { /* not important */ }
  }, [theme]);

  return { theme, toggle: () => setTheme(t => (t === 'day' ? 'night' : 'day')) };
}
