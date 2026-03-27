import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a human-readable relative time string (e.g. "2 hours ago", "3 days ago").
 * Lightweight replacement for date-fns formatDistanceToNow — no extra dependency needed.
 *
 * @param date - The date to compare against now
 */
export function formatDistanceToNow(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `${m} minute${m !== 1 ? 's' : ''} ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `${h} hour${h !== 1 ? 's' : ''} ago`;
  }
  if (diffSec < 86400 * 30) {
    const d = Math.floor(diffSec / 86400);
    return `${d} day${d !== 1 ? 's' : ''} ago`;
  }
  if (diffSec < 86400 * 365) {
    const mo = Math.floor(diffSec / (86400 * 30));
    return `${mo} month${mo !== 1 ? 's' : ''} ago`;
  }
  const y = Math.floor(diffSec / (86400 * 365));
  return `${y} year${y !== 1 ? 's' : ''} ago`;
}
