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
export type { IconProps, IconSize, IconComponent } from './primitives/Icon';
export { Text } from './primitives/Text';
export type { TextProps } from './primitives/Text';
export { Stack } from './primitives/Stack';
export type { StackProps } from './primitives/Stack';
export { Skeleton } from './primitives/Skeleton';
export type { SkeletonProps } from './primitives/Skeleton';
export { Spinner } from './primitives/Spinner';
export type { SpinnerProps } from './primitives/Spinner';
export { ProgressBar } from './primitives/ProgressBar';
export type { ProgressBarProps, ProgressBarColor } from './primitives/ProgressBar';
export { Divider } from './primitives/Divider';
export type { DividerProps } from './primitives/Divider';

// Composites — viewers
export { UnsupportedFileViewer } from './composites/viewers/UnsupportedFileViewer';
export { ImageViewer } from './composites/viewers/ImageViewer';
export { getViewer, MIME_REGISTRY } from './composites/viewers/registry';

// Composites — shell
export { FileViewerShell } from './composites/FileViewerShell';
export type { FileViewerShellProps } from './composites/FileViewerShell';
