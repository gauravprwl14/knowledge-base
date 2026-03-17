/**
 * KMS Design Token System — 3-Tier Architecture
 *
 * TIER 1: Primitive tokens (raw values, palette)
 * TIER 2: Semantic tokens (mode-aware, maps primitives to intent)
 * TIER 3: Component tokens (consumed by components via CSS variables)
 */

// ---------------------------------------------------------------------------
// TIER 1 — Primitive tokens
// ---------------------------------------------------------------------------

export const primitives = {
  colors: {
    // Neutrals (slate-based)
    neutral: {
      0: '#ffffff',
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      850: '#172033',
      900: '#0f172a',
      950: '#080f1e',
    },

    // Brand (indigo-based)
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

    // Status colors
    green: { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a' },
    amber: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
    red: { 400: '#f87171', 500: '#ef4444', 600: '#dc2626' },
    cyan: { 400: '#22d3ee', 500: '#06b6d4' },
  },

  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
  },

  radii: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    full: '9999px',
  },

  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  },
} as const;

// ---------------------------------------------------------------------------
// TIER 2 — Semantic tokens (light / dark mode)
// ---------------------------------------------------------------------------

export const semanticTokens = {
  dark: {
    bg: {
      primary: primitives.colors.neutral[950],
      secondary: primitives.colors.neutral[900],
      elevated: primitives.colors.neutral[850],
    },
    surface: {
      default: primitives.colors.neutral[900],
      raised: primitives.colors.neutral[800],
      overlay: primitives.colors.neutral[800],
    },
    border: {
      default: primitives.colors.neutral[800],
      subtle: primitives.colors.neutral[700],
      strong: primitives.colors.neutral[600],
    },
    text: {
      primary: primitives.colors.neutral[50],
      secondary: primitives.colors.neutral[400],
      muted: primitives.colors.neutral[600],
      inverse: primitives.colors.neutral[950],
    },
    accent: {
      default: primitives.colors.brand[500],
      hover: primitives.colors.brand[400],
      muted: primitives.colors.brand[900],
    },
    status: {
      success: primitives.colors.green[500],
      successBg: '#052e16',
      warning: primitives.colors.amber[500],
      warningBg: '#1c1003',
      error: primitives.colors.red[500],
      errorBg: '#1c0202',
    },
  },
  light: {
    bg: {
      primary: primitives.colors.neutral[50],
      secondary: primitives.colors.neutral[100],
      elevated: primitives.colors.neutral[0],
    },
    surface: {
      default: primitives.colors.neutral[0],
      raised: primitives.colors.neutral[50],
      overlay: primitives.colors.neutral[0],
    },
    border: {
      default: primitives.colors.neutral[200],
      subtle: primitives.colors.neutral[100],
      strong: primitives.colors.neutral[300],
    },
    text: {
      primary: primitives.colors.neutral[900],
      secondary: primitives.colors.neutral[600],
      muted: primitives.colors.neutral[400],
      inverse: primitives.colors.neutral[0],
    },
    accent: {
      default: primitives.colors.brand[600],
      hover: primitives.colors.brand[500],
      muted: primitives.colors.brand[50],
    },
    status: {
      success: primitives.colors.green[600],
      successBg: '#f0fdf4',
      warning: primitives.colors.amber[600],
      warningBg: '#fffbeb',
      error: primitives.colors.red[600],
      errorBg: '#fef2f2',
    },
  },
} as const;

// ---------------------------------------------------------------------------
// TIER 3 — CSS variable names (bridges tokens ↔ Tailwind config)
// ---------------------------------------------------------------------------

export const cssVarNames = {
  // Background
  bgPrimary: '--color-bg-primary',
  bgSecondary: '--color-bg-secondary',
  bgElevated: '--color-bg-elevated',
  // Surface
  surfaceDefault: '--color-surface',
  surfaceRaised: '--color-surface-raised',
  surfaceOverlay: '--color-surface-overlay',
  // Border
  borderDefault: '--color-border',
  borderSubtle: '--color-border-subtle',
  borderStrong: '--color-border-strong',
  // Text
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textMuted: '--color-text-muted',
  textInverse: '--color-text-inverse',
  // Accent
  accentDefault: '--color-accent',
  accentHover: '--color-accent-hover',
  accentMuted: '--color-accent-muted',
  // Status
  statusSuccess: '--color-status-success',
  statusSuccessBg: '--color-status-success-bg',
  statusWarning: '--color-status-warning',
  statusWarningBg: '--color-status-warning-bg',
  statusError: '--color-status-error',
  statusErrorBg: '--color-status-error-bg',
  // Layout
  sidebarWidth: '--sidebar-width',
  topbarHeight: '--topbar-height',
} as const;

export type SemanticMode = keyof typeof semanticTokens;
export type PrimitiveColors = typeof primitives.colors;
