import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilesDrawer } from '@/components/features/files/FilesDrawer';
import { filesApi } from '@/lib/api/files';

// Mock the files API
jest.mock('@/lib/api/files', () => ({
  filesApi: {
    get: jest.fn(),
  },
}));

// Mock @kb/ui to avoid needing the full package in frontend tests
jest.mock('@kb/ui', () => ({
  FileViewerShell: ({ file }: { file: { filename: string } }) => (
    <div data-testid="file-viewer-shell">{file.filename}</div>
  ),
  // Forward all props including aria-label so accessible name queries work
  Button: ({
    children,
    onClick,
    asChild: _asChild,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
  Spinner: () => <div role="status" />,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Icon: () => null,
}));

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>;
  };
});

const mockFile = {
  id: 'file-1',
  name: 'report.pdf',
  path: '/reports/report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024000,
  status: 'INDEXED' as const,
  sourceId: 'src-1',
  collectionId: null,
  tags: [],
  indexedAt: '2026-03-01T00:00:00Z',
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

describe('FilesDrawer', () => {
  beforeEach(() => {
    (filesApi.get as jest.Mock).mockResolvedValue(mockFile);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when fileId is null', () => {
    render(<FilesDrawer fileId={null} onClose={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the drawer when fileId is provided', async () => {
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows a spinner while the file is loading', () => {
    (filesApi.get as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders FileViewerShell with the fetched file', async () => {
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('file-viewer-shell')).toBeInTheDocument();
    });
    // The filename appears in both the header and inside FileViewerShell —
    // getAllByText confirms at least one instance is present.
    expect(screen.getAllByText('report.pdf').length).toBeGreaterThan(0);
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = jest.fn();
    render(<FilesDrawer fileId="file-1" onClose={onClose} />);
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = jest.fn();
    render(<FilesDrawer fileId="file-1" onClose={onClose} />);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when the API call fails', async () => {
    (filesApi.get as jest.Mock).mockRejectedValue(new Error('Not found'));
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/could not load file/i)).toBeInTheDocument();
    });
  });

  it('shows the "Open full view" link', async () => {
    render(<FilesDrawer fileId="file-1" onClose={jest.fn()} />);
    await screen.findByRole('dialog');
    const link = screen.getByRole('link', { name: /open full view/i });
    expect(link).toBeInTheDocument();
  });
});
