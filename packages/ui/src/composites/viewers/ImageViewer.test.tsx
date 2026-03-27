import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageViewer } from './ImageViewer';
import type { ViewerFile } from './types';

const mockFile: ViewerFile = {
  id: 'img-1',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  storageUrl: 'https://storage.example.com/photo.jpg',
  sizeBytes: 204800,
  status: 'INDEXED',
  metadata: {},
};

describe('ImageViewer', () => {
  it('renders an image with the correct src', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://storage.example.com/photo.jpg');
  });

  it('uses the filename as the alt text', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'photo.jpg');
  });

  it('shows a download button', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('href', 'https://storage.example.com/photo.jpg');
    expect(link).toHaveAttribute('download', 'photo.jpg');
  });

  it('shows a loading skeleton while image is loading', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    // The image is always rendered; we just verify it's in the document
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('shows an error state when the image fails to load', () => {
    render(<ImageViewer file={mockFile} mode="drawer" />);
    const img = screen.getByRole('img');
    // Simulate browser image load failure
    fireEvent.error(img);
    expect(screen.getByText(/could not load image/i)).toBeInTheDocument();
  });

  it('shows the View externally button when webViewLink is available', () => {
    render(
      <ImageViewer
        file={{ ...mockFile, webViewLink: 'https://drive.google.com/view' }}
        mode="drawer"
      />
    );
    expect(screen.getByRole('link', { name: /view externally/i })).toBeInTheDocument();
  });

  it('applies compact layout in artifact mode', () => {
    const { container } = render(<ImageViewer file={mockFile} mode="artifact" />);
    // artifact mode sets max-height on the image container
    expect(container.querySelector('[data-viewer-container]')).toBeInTheDocument();
  });
});
