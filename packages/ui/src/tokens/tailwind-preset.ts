/**
 * Tailwind CSS preset for @kb/ui.
 *
 * Extends the host app's Tailwind config with viewer-specific tokens.
 * The host app (frontend) imports this preset in its tailwind.config.ts.
 *
 * All color values reference CSS custom properties already defined in
 * frontend/app/globals.css — no new CSS variables are introduced here.
 * This preset adds semantic Tailwind class names that map to those variables.
 *
 * Note: We intentionally avoid importing `Config` from `tailwindcss` here —
 * `tailwindcss` is a dependency of the host app (frontend), not of @kb/ui.
 * The host app casts this object as `Config` at the import site.
 */
const kbUiPreset = {
  theme: {
    extend: {
      // Viewer-specific z-index scale
      zIndex: {
        'drawer': '50',
        'drawer-backdrop': '49',
        'viewer-toolbar': '10',
        'viewer-overlay': '20',
      },
      // Viewer-specific max-width/height utilities
      maxHeight: {
        'viewer-drawer': 'calc(100vh - 4rem)',
        'viewer-artifact': '600px',
      },
      // Drawer width
      width: {
        'drawer': '480px',
        'drawer-sm': '100vw',
      },
      // Animation for drawer slide-in (references keyframe defined in host config)
      transitionProperty: {
        'drawer': 'transform, opacity',
      },
    },
  },
};

export default kbUiPreset;
