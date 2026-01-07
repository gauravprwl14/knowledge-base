/**
 * Animation Tokens (Framer-style)
 * For use with Framer Motion and CSS transitions
 */

/**
 * Spring animations (Framer Motion)
 */
export const spring = {
  // Gentle spring for subtle animations
  gentle: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 25,
  },

  // Standard spring for most interactions
  standard: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
  },

  // Snappy spring for quick interactions
  snappy: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 35,
  },

  // Bouncy spring for playful interactions
  bouncy: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 25,
  },
} as const;

/**
 * Durations (milliseconds)
 */
export const duration = {
  instant: 0,
  fast: 150, // Micro-interactions
  normal: 250, // Standard transitions
  slow: 400, // Page transitions
  slower: 600, // Complex animations
} as const;

/**
 * Easings (Framer-style curves)
 * Format: [x1, y1, x2, y2] for cubic-bezier()
 */
export const easing = {
  // Standard easings
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],

  // Custom Framer-style curves
  smooth: [0.45, 0, 0.55, 1], // Gentle ease-in-out
  snappy: [0.34, 1.56, 0.64, 1], // Back-out (slight overshoot)
  expressive: [0.68, -0.55, 0.265, 1.55], // Back-in-out (overshoot both ends)
} as const;

/**
 * Transition presets
 */
export const transition = {
  // Fade transitions
  fade: {
    duration: duration.normal,
    ease: easing.smooth,
  },

  // Slide transitions
  slide: {
    duration: duration.normal,
    ease: easing.snappy,
  },

  // Scale transitions
  scale: {
    duration: duration.fast,
    ease: easing.snappy,
  },

  // Page transitions
  page: {
    duration: duration.slow,
    ease: easing.smooth,
  },
} as const;

/**
 * Framer Motion variants for common animations
 */
export const variants = {
  // Fade in/out
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },

  // Slide up
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },

  // Slide down
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },

  // Slide left
  slideLeft: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },

  // Slide right
  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  },

  // Scale in/out
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },

  // Pop (scale with bounce)
  pop: {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 },
  },

  // Stagger container (for lists)
  staggerContainer: {
    animate: {
      transition: {
        staggerChildren: 0.05,
      },
    },
  },

  // Stagger item
  staggerItem: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
  },
} as const;

/**
 * CSS keyframes for complex animations
 */
export const keyframes = {
  // Pulse effect
  pulse: `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `,

  // Shimmer effect (for skeletons)
  shimmer: `
    @keyframes shimmer {
      0% { background-position: -1000px 0; }
      100% { background-position: 1000px 0; }
    }
  `,

  // Spin effect
  spin: `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `,

  // Bounce effect
  bounce: `
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
  `,
} as const;

/**
 * Gesture response animations (for touch interactions)
 */
export const gestureAnimations = {
  // Tap/press feedback
  tap: {
    scale: 0.98,
    transition: { duration: duration.fast },
  },

  // Hover lift
  hover: {
    y: -2,
    transition: { duration: duration.fast },
  },

  // Drag constraints
  drag: {
    dragConstraints: { left: 0, right: 0, top: 0, bottom: 0 },
    dragElastic: 0.1,
  },
} as const;

export type Spring = keyof typeof spring;
export type Duration = keyof typeof duration;
export type Easing = keyof typeof easing;
export type Variant = keyof typeof variants;
