/**
 * Design System Theme
 * Inspired by Framer.com with Ray.so "Almost Cyan" color palette
 */

export const theme = {
  colors: {
    // Primary (Cyan/Teal) - From Ray.so Almost Cyan
    primary: {
      50: '#ecfeff',
      100: '#cffafe',
      200: '#a5f3fc',
      300: '#67e8f9',
      400: '#22d3ee', // Main accent
      500: '#06b6d4',
      600: '#0891b2',
      700: '#0e7490',
      800: '#155e75',
      900: '#164e63',
      950: '#083344',
    },

    // Dark mode (Framer-inspired deep blacks)
    dark: {
      bg: '#0a0a0a',
      surface: '#141414',
      surfaceHover: '#1a1a1a',
      border: '#2a2a2a',
      borderHover: '#3a3a3a',
    },

    // Text (high contrast for readability)
    text: {
      primary: '#ffffff',
      secondary: '#a1a1aa',
      muted: '#71717a',
      disabled: '#52525b',
    },

    // Semantic colors
    success: {
      DEFAULT: '#10b981',
      light: '#34d399',
      dark: '#059669',
    },
    error: {
      DEFAULT: '#ef4444',
      light: '#f87171',
      dark: '#dc2626',
    },
    warning: {
      DEFAULT: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
    },
    info: {
      DEFAULT: '#3b82f6',
      light: '#60a5fa',
      dark: '#2563eb',
    },
  },

  // Typography scale (Framer-inspired bold hierarchy)
  typography: {
    fontFamily: {
      sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      mono: ['var(--font-mono)', 'monospace'],
    },
    fontSize: {
      // Headings - Bold and impactful
      h1: ['3.5rem', { lineHeight: '1.2', fontWeight: '700' }], // 56px
      h2: ['2.5rem', { lineHeight: '1.3', fontWeight: '700' }], // 40px
      h3: ['1.875rem', { lineHeight: '1.4', fontWeight: '600' }], // 30px
      h4: ['1.5rem', { lineHeight: '1.5', fontWeight: '600' }], // 24px
      h5: ['1.25rem', { lineHeight: '1.5', fontWeight: '600' }], // 20px
      h6: ['1.125rem', { lineHeight: '1.5', fontWeight: '600' }], // 18px

      // Body - Readable and clear
      'body-lg': ['1.125rem', { lineHeight: '1.6', fontWeight: '400' }], // 18px
      body: ['1rem', { lineHeight: '1.6', fontWeight: '400' }], // 16px
      'body-sm': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }], // 14px
      'body-xs': ['0.75rem', { lineHeight: '1.5', fontWeight: '400' }], // 12px
    },
  },

  // Glass Morphism (Moderate level)
  glassMorphism: {
    light: {
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    medium: {
      background: 'rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
    },
    heavy: {
      background: 'rgba(255, 255, 255, 0.12)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
  },

  // Spacing scale
  spacing: {
    xs: '0.25rem', // 4px
    sm: '0.5rem', // 8px
    md: '1rem', // 16px
    lg: '1.5rem', // 24px
    xl: '2rem', // 32px
    '2xl': '3rem', // 48px
    '3xl': '4rem', // 64px
    '4xl': '6rem', // 96px
  },

  // Border radius
  borderRadius: {
    none: '0',
    sm: '0.25rem', // 4px
    DEFAULT: '0.5rem', // 8px
    md: '0.75rem', // 12px
    lg: '1rem', // 16px
    xl: '1.5rem', // 24px
    '2xl': '2rem', // 32px
    full: '9999px',
  },

  // Shadows (subtle, Framer-style)
  boxShadow: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
    none: 'none',
  },
} as const;

export type Theme = typeof theme;
