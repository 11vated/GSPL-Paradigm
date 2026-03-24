import { useState, useEffect } from 'react';

/** Tailwind-aligned breakpoints. */
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

/** Returns true when viewport width is >= the given breakpoint. */
export function useMediaQuery(breakpoint: Breakpoint): boolean {
  const px = BREAKPOINTS[breakpoint];
  const query = `(min-width: ${px}px)`;

  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Returns the current active breakpoint name. */
export function useBreakpoint(): Breakpoint | 'xs' {
  const sm = useMediaQuery('sm');
  const md = useMediaQuery('md');
  const lg = useMediaQuery('lg');
  const xl = useMediaQuery('xl');
  const xxl = useMediaQuery('2xl');

  if (xxl) return '2xl';
  if (xl) return 'xl';
  if (lg) return 'lg';
  if (md) return 'md';
  if (sm) return 'sm';
  return 'xs';
}

/** Returns true when viewport is mobile-sized (below md breakpoint). */
export function useIsMobile(): boolean {
  return !useMediaQuery('md');
}
