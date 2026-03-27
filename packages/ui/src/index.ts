/**
 * @kb/ui — shared React component library for the KMS knowledge base.
 *
 * IMPORTANT: This package is consumed via Next.js `transpilePackages`.
 * `frontend/next.config.js` must include `transpilePackages: ['@kb/ui']`.
 * Components are added to this barrel export as they are built.
 */

// Types
export type { ViewerFile, ViewerMode, ViewerProps } from './composites/viewers/types';

// Primitives
export { Button } from './primitives/Button';
export type { ButtonProps } from './primitives/Button';
export { Badge } from './primitives/Badge';
export type { BadgeProps, BadgeColor } from './primitives/Badge';
export { Icon } from './primitives/Icon';
export type { IconProps, IconSize } from './primitives/Icon';
export { Text } from './primitives/Text';
export type { TextProps } from './primitives/Text';
