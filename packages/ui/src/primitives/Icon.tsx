import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Mapping of size tokens to Tailwind h-/w- utility pairs.
 * Both dimensions are set together to keep icons square at all sizes.
 */
const sizeMap = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
} as const;

/** Union of supported icon size tokens. */
export type IconSize = keyof typeof sizeMap;

/** Props accepted by the Icon component. */
export interface IconProps extends React.SVGAttributes<SVGElement> {
  /**
   * The Lucide icon component to render.
   * Pass the component reference directly — do NOT call it as a function.
   *
   * @example
   * import { FileTextIcon } from 'lucide-react';
   * <Icon icon={FileTextIcon} />
   */
  icon: LucideIcon;
  /**
   * Predefined size token that maps to Tailwind h-/w- classes.
   * @default 'md'
   */
  size?: IconSize;
  /** Additional Tailwind classes (e.g. colour utilities like `text-blue-400`). */
  className?: string;
}

/**
 * Icon — thin wrapper around Lucide icons with consistent sizing tokens.
 *
 * Handles accessibility automatically:
 * - decorative icons (no `aria-label`) get `aria-hidden="true"` so screen
 *   readers skip them.
 * - labelled icons (`aria-label` provided) expose the label to AT and
 *   remove `aria-hidden`.
 *
 * @example
 * <Icon icon={FileTextIcon} size="sm" className="text-blue-400" />
 * <Icon icon={AlertCircleIcon} size="md" aria-label="Warning" />
 */
export const Icon: React.FC<IconProps> = ({
  icon: LucideComponent,
  size = 'md',
  className,
  ...props
}) => {
  // When no aria-label is supplied the icon is purely decorative — hide from
  // screen readers. When aria-label is provided, expose it to AT.
  const ariaHidden = props['aria-label'] ? undefined : true;

  return (
    <LucideComponent
      className={cn(sizeMap[size], className)}
      aria-hidden={ariaHidden}
      {...props}
    />
  );
};

Icon.displayName = 'Icon';
