/**
 * Breakpoints Strategy - Mobile-First Responsive Design
 */

export const breakpoints = {
  xs: '320px', // Mobile phones (portrait)
  sm: '640px', // Mobile phones (landscape)
  md: '768px', // Tablets
  lg: '1024px', // Small laptops
  xl: '1280px', // Desktop
  '2xl': '1536px', // Large desktop
  '3xl': '1920px', // Ultra-wide monitors
} as const;

/**
 * Layout Adaptations by Breakpoint
 */
export const layoutAdaptations = {
  // xs-sm (Mobile): Bottom navigation, hamburger menu, single column
  mobile: {
    range: '320px - 639px',
    navigation: 'bottom-nav',
    menu: 'hamburger',
    columns: 1,
    cardWidth: '100%',
    tapTargetSize: '44px',
  },

  // md (Tablet): Collapsible sidebar, 2-column grids
  tablet: {
    range: '768px - 1023px',
    navigation: 'collapsible-sidebar',
    menu: 'inline',
    columns: 2,
    cardWidth: '50%',
    tapTargetSize: '48px',
  },

  // lg-xl (Desktop): Full sidebar, 3-column grids
  desktop: {
    range: '1024px - 1535px',
    navigation: 'full-sidebar',
    menu: 'inline',
    columns: 3,
    cardWidth: '33.33%',
    margins: '24px',
  },

  // 2xl-3xl (Ultra-wide): Max content width, centered
  ultrawide: {
    range: '1536px+',
    navigation: 'full-sidebar',
    menu: 'inline',
    columns: 3,
    maxContentWidth: '1440px',
    centered: true,
    sideMargins: 'auto',
  },
} as const;

/**
 * Utility function to check if current viewport matches breakpoint
 * (Client-side only)
 */
export const useBreakpoint = (breakpoint: keyof typeof breakpoints) => {
  if (typeof window === 'undefined') return false;
  const query = window.matchMedia(`(min-width: ${breakpoints[breakpoint]})`);
  return query.matches;
};

/**
 * Get responsive value based on current breakpoint
 */
export const getResponsiveValue = <T>(values: {
  xs?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  '2xl'?: T;
  '3xl'?: T;
}): T | undefined => {
  if (typeof window === 'undefined') return values.xs;

  const breakpointKeys = Object.keys(breakpoints) as (keyof typeof breakpoints)[];
  const matchingBreakpoints = breakpointKeys.filter((bp) => useBreakpoint(bp));

  // Return the value for the largest matching breakpoint
  for (let i = matchingBreakpoints.length - 1; i >= 0; i--) {
    const bp = matchingBreakpoints[i];
    if (values[bp] !== undefined) {
      return values[bp];
    }
  }

  return values.xs;
};

export type Breakpoint = keyof typeof breakpoints;
