'use client';
import React from 'react';
import { Search, X } from 'lucide-react';
import { Input, type InputProps } from './Input';

export interface SearchInputProps extends Omit<InputProps, 'prefix' | 'suffix'> {
  /** Called when the clear button is clicked */
  onClear?: () => void;
}

/**
 * Search input with a search icon on the left and an optional clear button
 * on the right when the input has a value.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onClear, className, ...rest }, ref) => {
    const hasValue = Boolean(value);

    const searchIcon = (
      <Search className="w-4 h-4" aria-hidden="true" />
    );

    const clearButton = hasValue ? (
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear search"
        className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 pointer-events-auto"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    ) : null;

    return (
      <Input
        ref={ref}
        type="search"
        role="searchbox"
        value={value}
        prefix={searchIcon}
        suffix={clearButton}
        className={className}
        {...rest}
      />
    );
  }
);

SearchInput.displayName = 'SearchInput';
