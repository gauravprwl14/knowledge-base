import { cn } from './cn';

describe('cn', () => {
  it('merges class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('deduplicates conflicting Tailwind classes — last wins', () => {
    // tailwind-merge: p-4 wins over p-2 when both present
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('ignores falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, null, 'baz')).toBe('foo baz');
  });

  it('handles conditional objects (clsx syntax)', () => {
    expect(cn({ active: true, disabled: false })).toBe('active');
  });
});
