import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * cva variant definitions for Text.
 *
 * Variants map semantic meaning to Tailwind utilities so call-sites express
 * intent (e.g. `variant="muted"`) rather than raw colour classes.
 *
 * Sizes are independent of variants — any variant can be combined with any
 * size, enabling e.g. a small heading or a large caption.
 */
const textVariants = cva('', {
  variants: {
    variant: {
      body:    'text-slate-100',
      heading: 'text-slate-50 font-semibold',
      caption: 'text-slate-400 text-sm',
      muted:   'text-slate-400',
      code:    'font-mono text-slate-200 bg-slate-800 px-1 rounded text-sm',
      error:   'text-red-400',
    },
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
    },
  },
  defaultVariants: { variant: 'body', size: 'md' },
});

/**
 * HTML elements that Text may render as.
 * Restricted to semantic text elements — no `<div>` to avoid misuse.
 */
type TextElement =
  | 'p'
  | 'span'
  | 'div'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'label'
  | 'strong'
  | 'em';

/** Props accepted by the Text component. */
export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  /**
   * HTML element to render as. Defaults to `<p>`.
   * Use semantic elements (`h2`, `label`, `strong`) where appropriate.
   * @default 'p'
   */
  as?: TextElement;
}

/**
 * Text — polymorphic typographic primitive with consistent KMS design tokens.
 *
 * Choose the correct `as` element for the DOM semantics, and the `variant`
 * for the visual intent. The two are intentionally decoupled so you can
 * render a visually-muted `<h3>` without fighting the default heading styles.
 *
 * @example
 * <Text as="h3" variant="heading" size="lg">Section heading</Text>
 * <Text variant="muted" size="sm">Last indexed 2 days ago</Text>
 * <Text variant="code">KBFIL0001</Text>
 */
export const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ as: Tag = 'p', variant, size, className, ...props }, ref) => {
    return (
      // TypeScript cannot narrow the ref type for a polymorphic `Tag` union
      // (it requires an intersection of all element ref types which is
      // unsatisfiable). Casting to `any` is the standard escape hatch for
      // polymorphic components — the runtime behaviour is correct because all
      // TextElement tags produce HTMLElement descendants.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Tag
        ref={ref as any}
        className={cn(textVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Text.displayName = 'Text';
