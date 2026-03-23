/**
 * SourcesOAuth.test.tsx
 *
 * Unit tests for the Sources page OAuth flow — specifically the
 * "Connect Google Drive" button and its error-handling path.
 *
 * Covers:
 * - "Connect Google Drive" button is present in the DOM (not hidden or disabled)
 * - clicking the button calls kmsSourcesApi.initiateGoogleDrive()
 * - shows an error banner when initiateGoogleDrive rejects
 * - the error banner message is specific to the Google Drive failure
 * - the error banner is dismissible via the "Dismiss" button
 * - does NOT require user state to be pre-loaded (no user guard blocks the button)
 */

// ---------------------------------------------------------------------------
// Mocks — declared before any import so jest hoisting picks them up
// ---------------------------------------------------------------------------

const mockInitiateGoogleDrive = jest.fn();
const mockList = jest.fn();
const mockTriggerScan = jest.fn();
const mockDisconnect = jest.fn();
const mockGetClearStatus = jest.fn();

jest.mock('@/lib/api/sources', () => ({
  kmsSourcesApi: {
    list: (...args: unknown[]) => mockList(...args),
    initiateGoogleDrive: (...args: unknown[]) => mockInitiateGoogleDrive(...args),
    triggerScan: (...args: unknown[]) => mockTriggerScan(...args),
    disconnect: (...args: unknown[]) => mockDisconnect(...args),
    getClearStatus: (...args: unknown[]) => mockGetClearStatus(...args),
    updateConfig: jest.fn(),
    listDriveFolders: jest.fn().mockResolvedValue({ folders: [] }),
    getScanHistory: jest.fn().mockResolvedValue([]),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SourcesPage from '@/app/[locale]/(dashboard)/sources/page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sources page — Connect Google Drive button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: list returns empty array so we reach the rendered state quickly
    mockList.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // Button presence
  // -------------------------------------------------------------------------

  it('renders the "Connect Google Drive" button in the DOM', async () => {
    renderPage();

    // The button should be present immediately — it is not gated on user state
    const btn = screen.getByRole('button', { name: /connect google drive/i });
    expect(btn).toBeInTheDocument();
  });

  it('the "Connect Google Drive" button is not disabled', async () => {
    renderPage();

    const btn = screen.getByRole('button', { name: /connect google drive/i });
    expect(btn).not.toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------

  it('calls kmsSourcesApi.initiateGoogleDrive() when the button is clicked', async () => {
    mockInitiateGoogleDrive.mockResolvedValue(undefined);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /connect google drive/i }));

    await waitFor(() => {
      expect(mockInitiateGoogleDrive).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call initiateGoogleDrive until the button is explicitly clicked', () => {
    renderPage();
    expect(mockInitiateGoogleDrive).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Error path
  // -------------------------------------------------------------------------

  it('shows error banner when initiateGoogleDrive rejects', async () => {
    mockInitiateGoogleDrive.mockRejectedValue(new Error('OAuth service unavailable'));

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /connect google drive/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/failed to start google drive connection/i),
      ).toBeInTheDocument();
    });
  });

  it('error banner text mentions retrying', async () => {
    mockInitiateGoogleDrive.mockRejectedValue(new Error('timeout'));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /connect google drive/i }));

    await waitFor(() => {
      const banner = screen.getByText(/failed to start google drive connection/i);
      expect(banner.textContent).toMatch(/please try again/i);
    });
  });

  it('does NOT show an error banner before the button is clicked', async () => {
    // Let the list load so we are past the loading skeleton
    mockList.mockResolvedValue([]);
    renderPage();

    await waitFor(() => {
      expect(screen.queryByText(/failed to start google drive connection/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Dismiss
  // -------------------------------------------------------------------------

  it('error banner is dismissible', async () => {
    mockInitiateGoogleDrive.mockRejectedValue(new Error('Connection refused'));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /connect google drive/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/failed to start google drive connection/i),
      ).toBeInTheDocument();
    });

    // Click the dismiss button
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(
        screen.queryByText(/failed to start google drive connection/i),
      ).not.toBeInTheDocument();
    });
  });

  it('dismiss button is present alongside the error message', async () => {
    mockInitiateGoogleDrive.mockRejectedValue(new Error('500'));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /connect google drive/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // No user-guard requirement
  // -------------------------------------------------------------------------

  it('renders the button without needing an authenticated user context', () => {
    // We render SourcesPage with NO auth provider wrapper.
    // If the component required a user context it would throw here.
    expect(() => renderPage()).not.toThrow();
    expect(
      screen.getByRole('button', { name: /connect google drive/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<SourcesPage />);
}
