import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { UnsupportedFileViewer } from './UnsupportedFileViewer';
import type { ViewerFile } from './types';

const mockFile: ViewerFile = {
  id: 'abc',
  filename: 'data.xyz',
  mimeType: 'application/x-unknown',
  storageUrl: 'https://storage/data.xyz',
  sizeBytes: 1024,
  status: 'INDEXED',
  metadata: {},
};

describe('UnsupportedFileViewer', () => {
  it('shows the filename', () => {
    render(<UnsupportedFileViewer file={mockFile} mode="drawer" />);
    expect(screen.getByText('data.xyz')).toBeInTheDocument();
  });

  it('shows the MIME type', () => {
    render(<UnsupportedFileViewer file={mockFile} mode="drawer" />);
    expect(screen.getByText('application/x-unknown')).toBeInTheDocument();
  });

  it('shows a download link when storageUrl is available', () => {
    render(<UnsupportedFileViewer file={mockFile} mode="drawer" />);
    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('href', 'https://storage/data.xyz');
  });

  it('shows a View externally link when webViewLink is provided', () => {
    render(
      <UnsupportedFileViewer
        file={{ ...mockFile, webViewLink: 'https://drive.google.com/view' }}
        mode="drawer"
      />
    );
    expect(screen.getByRole('link', { name: /view externally/i })).toBeInTheDocument();
  });

  it('does not show View externally link when webViewLink is absent', () => {
    render(<UnsupportedFileViewer file={mockFile} mode="drawer" />);
    expect(screen.queryByRole('link', { name: /view externally/i })).not.toBeInTheDocument();
  });
});
