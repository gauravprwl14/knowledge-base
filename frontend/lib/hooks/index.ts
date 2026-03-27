/**
 * Hooks — barrel export
 *
 * Import all hooks from here:
 * `import { useLogin, useMe, useQuery, useMutation } from '@/lib/hooks'`
 */

// Primitives
export { useQuery } from './use-query';
export type { UseQueryOptions, UseQueryResult } from './use-query';

export { useMutation } from './use-mutation';
export type {
  UseMutationOptions,
  UseMutationResult,
} from './use-mutation';

// Auth
export * from './auth';
