import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    screens: {
      xs: '320px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
    extend: {
      // -----------------------------------------------------------------------
      // KMS semantic color tokens — all reference CSS variables so they switch
      // between light/dark mode via :root / .dark selectors in globals.css.
      // -----------------------------------------------------------------------
      colors: {
        // Legacy tokens (keep for backward-compat with existing components)
        primary: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
        dark: {
          bg: '#0a0a0a',
          surface: '#141414',
          surfaceHover: '#1a1a1a',
          border: '#2a2a2a',
          borderHover: '#3a3a3a',
        },
        text: {
          primary: '#ffffff',
          secondary: '#a1a1aa',
          muted: '#71717a',
          disabled: '#52525b',
        },
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

        // KMS design-system tokens — CSS variable driven (light/dark aware)
        kms: {
          // Background layers
          'bg-primary': 'var(--color-bg-primary)',
          'bg-secondary': 'var(--color-bg-secondary)',
          'bg-elevated': 'var(--color-bg-elevated)',
          // Surfaces
          surface: 'var(--color-surface)',
          'surface-raised': 'var(--color-surface-raised)',
          'surface-overlay': 'var(--color-surface-overlay)',
          // Borders
          border: 'var(--color-border)',
          'border-subtle': 'var(--color-border-subtle)',
          'border-strong': 'var(--color-border-strong)',
          // Text
          'text-primary': 'var(--color-text-primary)',
          'text-secondary': 'var(--color-text-secondary)',
          'text-muted': 'var(--color-text-muted)',
          'text-inverse': 'var(--color-text-inverse)',
          // Accent / brand
          accent: 'var(--color-accent)',
          'accent-hover': 'var(--color-accent-hover)',
          'accent-muted': 'var(--color-accent-muted)',
          // Status
          success: 'var(--color-status-success)',
          'success-bg': 'var(--color-status-success-bg)',
          warning: 'var(--color-status-warning)',
          'warning-bg': 'var(--color-status-warning-bg)',
          error: 'var(--color-status-error)',
          'error-bg': 'var(--color-status-error-bg)',
        },

        // Brand primitives (indigo-based) — for direct use when needed
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },

        // KMS premium design palette — violet/purple gradient, deep surfaces
        kms2: {
          // Primary gradient anchors
          'violet-600': '#7C3AED',
          'violet-500': '#8B5CF6',
          'purple-500': '#A855F7',
          'purple-400': '#C084FC',
          // Cyan/teal accent
          'cyan-500': '#06B6D4',
          'cyan-600': '#0891B2',
          // Deep surface backgrounds
          'bg-base': '#0A0A0F',
          'bg-raised': '#12121A',
          'bg-elevated': '#1A1A2E',
          'surface': '#0D0D14',
          'surface-raised': '#161622',
          // Text scale
          'text-primary': '#F8F8FF',
          'text-secondary': '#A0A0B0',
          'text-muted': '#6B6B80',
        },
      },

      // -----------------------------------------------------------------------
      // Layout helpers
      // -----------------------------------------------------------------------
      spacing: {
        'sidebar': 'var(--sidebar-width)',
        'topbar': 'var(--topbar-height)',
      },
      width: {
        'sidebar': 'var(--sidebar-width)',
      },
      height: {
        'topbar': 'var(--topbar-height)',
      },
      paddingLeft: {
        'sidebar': 'var(--sidebar-width)',
      },
      paddingTop: {
        'topbar': 'var(--topbar-height)',
      },
      marginLeft: {
        'sidebar': 'var(--sidebar-width)',
      },

      // -----------------------------------------------------------------------
      // Typography — unchanged from previous config
      // -----------------------------------------------------------------------
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      fontSize: {
        h1: ['3.5rem', { lineHeight: '1.2', fontWeight: '700' }],
        h2: ['2.5rem', { lineHeight: '1.3', fontWeight: '700' }],
        h3: ['1.875rem', { lineHeight: '1.4', fontWeight: '600' }],
        h4: ['1.5rem', { lineHeight: '1.5', fontWeight: '600' }],
        h5: ['1.25rem', { lineHeight: '1.5', fontWeight: '600' }],
        h6: ['1.125rem', { lineHeight: '1.5', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6', fontWeight: '400' }],
        body: ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'body-xs': ['0.75rem', { lineHeight: '1.5', fontWeight: '400' }],
      },

      // -----------------------------------------------------------------------
      // Animations — unchanged from previous config
      // -----------------------------------------------------------------------
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s linear infinite',
        spin: 'spin 1s linear infinite',
        bounce: 'bounce 1s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        bounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideIn: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
