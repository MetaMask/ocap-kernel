import { useLayoutEffect, useEffect, useState } from 'react';

/**
 * Custom hook to detect and manage dark mode based on system preference.
 * Automatically applies/removes the 'dark' class to the document root.
 */
export const useDarkMode = (): void => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Check system preference for dark mode
  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent): void => {
      setIsDarkMode(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    // Force a change event to ensure the initial state is set
    mediaQuery.dispatchEvent(
      new MediaQueryListEvent('change', { matches: true }),
    );

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply dark mode class to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
};
