/**
 * Unit tests for DisconnectConfirmModal
 *
 * Covers:
 * - Modal renders when open=true
 * - Modal does NOT render when open=false
 * - "Disconnect only" calls disconnect(id, false)
 * - "Disconnect & clear data" calls disconnect(id, true) then polls clear-status
 * - onDone is called with the source ID on success
 * - Error state renders when disconnect fails
 */

import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DisconnectConfirmModal } from '@/components/features/sources/DisconnectConfirmModal';
import * as sourcesApi from '@/lib/api/sources';
import type { KmsSource } from '@/lib/api/sources';

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/api/sources', () => ({
  kmsSourcesApi: {
    disconnect: jest.fn(),
    getClearStatus: jest.fn(),
  },
}));

const mockSourcesApi = sourcesApi.kmsSourcesApi as jest.Mocked<typeof sourcesApi.kmsSourcesApi>;

// ── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_SOURCE: KmsSource = {
  id: 'src-001',
  userId: 'user-001',
  type: 'GOOGLE_DRIVE',
  status: 'CONNECTED',
  displayName: 'My Drive',
  externalId: null,
  lastSyncedAt: null,
  createdAt: new Date().toISOString(),
};

function renderModal(props: Partial<React.ComponentProps<typeof DisconnectConfirmModal>> = {}) {
  const onClose = jest.fn();
  const onDone = jest.fn();
  render(
    <DisconnectConfirmModal
      source={MOCK_SOURCE}
      open={true}
      onClose={onClose}
      onDone={onDone}
      {...props}
    />,
  );
  return { onClose, onDone };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DisconnectConfirmModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders confirm options when open=true', () => {
    renderModal();
    expect(screen.getByText(/Disconnect My Drive/i)).toBeInTheDocument();
    expect(screen.getByText(/Disconnect only/i)).toBeInTheDocument();
    expect(screen.getByText(/Disconnect.*clear data/i)).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    renderModal({ open: false });
    expect(screen.queryByText(/Disconnect My Drive/i)).not.toBeInTheDocument();
  });

  it('calls disconnect(id, false) when "Disconnect only" is clicked', async () => {
    mockSourcesApi.disconnect.mockResolvedValue({});
    const { onDone } = renderModal();

    fireEvent.click(screen.getByText(/Disconnect only/i));

    await waitFor(() => {
      expect(mockSourcesApi.disconnect).toHaveBeenCalledWith('src-001', false);
    });

    // Advance the close timer
    act(() => { jest.advanceTimersByTime(1000); });

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('src-001');
    });
  });

  it('calls disconnect(id, true) and polls clear-status when "Disconnect & clear data" is clicked', async () => {
    mockSourcesApi.disconnect.mockResolvedValue({ jobId: 'clear-job-001' });
    mockSourcesApi.getClearStatus
      .mockResolvedValueOnce({
        id: 'clear-job-001',
        status: 'RUNNING',
        filesDeleted: 5,
        chunksDeleted: 50,
        errorMsg: null,
        createdAt: new Date().toISOString(),
      })
      .mockResolvedValue({
        id: 'clear-job-001',
        status: 'COMPLETED',
        filesDeleted: 12,
        chunksDeleted: 143,
        errorMsg: null,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

    const { onDone } = renderModal();

    fireEvent.click(screen.getByText(/Disconnect.*clear data/i));

    await waitFor(() => {
      expect(mockSourcesApi.disconnect).toHaveBeenCalledWith('src-001', true);
    });

    // Let polling run
    await act(async () => { jest.advanceTimersByTime(5000); });

    await waitFor(() => {
      expect(mockSourcesApi.getClearStatus).toHaveBeenCalled();
    });

    // Advance close timer
    act(() => { jest.advanceTimersByTime(1000); });

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('src-001');
    });
  });

  it('shows error state when disconnect throws', async () => {
    mockSourcesApi.disconnect.mockRejectedValue(new Error('Network error'));
    renderModal();

    fireEvent.click(screen.getByText(/Disconnect only/i));

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
