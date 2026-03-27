import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Button variant definitions using cva.
 *
 * Design rules:
 *  - All color values reference Tailwind utilities that map to CSS custom
 *    properties set in the host app's globals.css.
 *  - `solid` is the default — high-emphasis actions (save, confirm).
 *  - `ghost` is for low-emphasis actions (cancel, dismiss).
 *  - `outline` is for secondary actions alongside a solid button.
 *  - `destructive` is for irreversible actions (delete, remove).
 */
const buttonVariants = cva(
  // Base classes applied to every button variant
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-md font-medium text-sm',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
  ],
  {
    variants: {
      variant: {
        solid: 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700',
        ghost: 'bg-transparent text-slate-300 hover:bg-white/10 active:bg-white/20',
        outline: 'border border-slate-600 bg-transparent text-slate-300 hover:bg-white/5 active:bg-white/10',
        destructive: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
      },
      size: {
        sm: 'h-7 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'solid',
      size: 'md',
    },
  }
);

/** Props accepted by the Button component. */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * When true, the button renders as its child element instead of a <button>.
   * Use this for rendering a button-styled <a> or <Link>.
   *
   * @example
   * <Button asChild><a href="/dashboard">Go to Dashboard</a></Button>
   */
  asChild?: boolean;
}

/**
 * Button — base interactive element for @kb/ui.
 *
 * Supports 4 variants (solid, ghost, outline, destructive) and
 * 4 sizes (sm, md, lg, icon). Forwards ref to the underlying element.
 * Use `asChild` to render as a different element (e.g. a link).
 *
 * @example
 * <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
 * <Button variant="destructive" onClick={onDelete}>Delete file</Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // Slot renders as the child element when asChild is true (Radix pattern).
    // When asChild is false, render a plain <button> element.
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref as React.Ref<HTMLButtonElement>}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
