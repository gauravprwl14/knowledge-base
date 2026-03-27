import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { FileViewerShell } from './FileViewerShell';
import type { ViewerFile } from './viewers/types';

// Mock the registry to avoid dynamic imports in tests.
// getViewer is synchronous in our mock, so Suspense resolves immediately.
jest.mock('./viewers/registry', () => ({
  getViewer: (mimeType: string) => {
    if (mimeType === 'image/jpeg') {
      return function StubImageViewer() { return <div data-testid="image-viewer">Image</div>; };
    }
    return function StubUnsupported() { return <div data-testid="unsupported-viewer">Unsupported</div>; };
  },
}));

const imageFile: ViewerFile = {
  id: '1',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  storageUrl: 'https://storage/photo.jpg',
  sizeBytes: 204800,
  status: 'INDEXED',
  metadata: {},
};

const unknownFile: ViewerFile = {
  id: '2',
  filename: 'data.xyz',
  mimeType: 'application/x-unknown',
  storageUrl: 'https://storage/data.xyz',
  sizeBytes: 512,
  status: 'INDEXED',
  metadata: {},
};

const processingFile: ViewerFile = {
  ...imageFile,
  id: '3',
  status: 'PROCESSING',
};

describe('FileViewerShell', () => {
  it('mounts ImageViewer for image/jpeg', () => {
    render(<FileViewerShell file={imageFile} mode="drawer" />);
    expect(screen.getByTestId('image-viewer')).toBeInTheDocument();
  });

  it('falls back to UnsupportedFileViewer for unknown MIME type', () => {
    render(<FileViewerShell file={unknownFile} mode="drawer" />);
    expect(screen.getByTestId('unsupported-viewer')).toBeInTheDocument();
  });

  it('shows processing state when file status is PROCESSING', () => {
    render(<FileViewerShell file={processingFile} mode="drawer" />);
    // ProcessingPlaceholder renders a [role="status"] element
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state when file status is ERROR', () => {
    render(
      <FileViewerShell
        file={{ ...imageFile, status: 'ERROR' }}
        mode="drawer"
      />
    );
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });

  it('shows unsupported state when file status is UNSUPPORTED', () => {
    render(
      <FileViewerShell
        file={{ ...imageFile, status: 'UNSUPPORTED' }}
        mode="drawer"
      />
    );
    expect(screen.getByTestId('unsupported-viewer')).toBeInTheDocument();
  });

  it('passes mode prop to the mounted viewer', () => {
    render(<FileViewerShell file={imageFile} mode="artifact" />);
    expect(screen.getByTestId('image-viewer')).toBeInTheDocument();
  });
});
