/**
 * Unit tests for TranscriptionStatusBadge component.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TranscriptionStatusBadge } from '@/components/features/drive/TranscriptionStatusBadge';
import type { TranscriptionStatus } from '@/lib/api/files';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<TranscriptionStatus> = {}): TranscriptionStatus {
  return {
    id: 'job-1',
    status: 'COMPLETED',
    language: 'en',
    durationSeconds: null,
    completedAt: '2024-01-01T00:00:00.000Z',
    errorMsg: null,
    modelUsed: 'whisper-large-v3',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TranscriptionStatusBadge', () => {
  it('renders "Transcribing…" for PENDING status', () => {
    render(<TranscriptionStatusBadge job={makeJob({ status: 'PENDING' })} />);
    expect(screen.getByText('Transcribing\u2026')).toBeInTheDocument();
  });

  it('renders "Transcribing…" for PROCESSING status', () => {
    render(<TranscriptionStatusBadge job={makeJob({ status: 'PROCESSING' })} />);
    expect(screen.getByText('Transcribing\u2026')).toBeInTheDocument();
  });

  it('renders "Transcribed" for COMPLETED status without duration', () => {
    render(<TranscriptionStatusBadge job={makeJob({ status: 'COMPLETED', durationSeconds: null })} />);
    expect(screen.getByText('Transcribed')).toBeInTheDocument();
  });

  it('renders formatted duration for COMPLETED status with durationSeconds', () => {
    render(
      <TranscriptionStatusBadge
        job={makeJob({ status: 'COMPLETED', durationSeconds: 123 })}
      />,
    );
    expect(screen.getByText('Transcribed')).toBeInTheDocument();
    // 123 seconds = 2 minutes 3 seconds → "2:03"
    expect(screen.getByText('2:03')).toBeInTheDocument();
  });

  it('renders "Transcription failed" for FAILED status', () => {
    render(
      <TranscriptionStatusBadge
        job={makeJob({ status: 'FAILED', errorMsg: 'Audio too short' })}
      />,
    );
    expect(screen.getByText('Transcription failed')).toBeInTheDocument();
  });

  it('renders "Transcription skipped" for SKIPPED status', () => {
    render(<TranscriptionStatusBadge job={makeJob({ status: 'SKIPPED' })} />);
    expect(screen.getByText('Transcription skipped')).toBeInTheDocument();
  });

  it('renders a zero-second duration as "0:00"', () => {
    render(
      <TranscriptionStatusBadge
        job={makeJob({ status: 'COMPLETED', durationSeconds: 0 })}
      />,
    );
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('formats a 60-second duration as "1:00"', () => {
    render(
      <TranscriptionStatusBadge
        job={makeJob({ status: 'COMPLETED', durationSeconds: 60 })}
      />,
    );
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('applies additional className to the pill wrapper', () => {
    const { container } = render(
      <TranscriptionStatusBadge
        job={makeJob({ status: 'COMPLETED' })}
        className="mt-1"
      />,
    );
    // The span wrapping the badge should contain our class
    const span = container.querySelector('span');
    expect(span?.className).toContain('mt-1');
  });
});
