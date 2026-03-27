import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS class names safely.
 *
 * Combines `clsx` (conditional class logic) with `tailwind-merge`
 * (deduplication of conflicting Tailwind utilities, e.g. p-2 vs p-4).
 *
 * @param inputs - Any number of class values, objects, or arrays
 * @returns A single merged class string
 *
 * @example
 * cn('p-2 text-sm', isActive && 'bg-blue-500', { 'opacity-50': isDisabled })
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
