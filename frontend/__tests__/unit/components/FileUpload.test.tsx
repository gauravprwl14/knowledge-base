/**
 * Unit tests for FileUpload component.
 *
 * Component behaviour:
 *   1. Dropping / selecting files adds them to local state (does NOT call onUpload yet).
 *   2. Clicking the "Upload N file(s)" button calls onUpload(files) and clears state.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import FileUpload from '@/components/FileUpload'

describe('FileUpload Component', () => {
  const mockOnUpload = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders upload area', () => {
    render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    expect(screen.getByText(/drag & drop files here/i)).toBeInTheDocument()
    expect(screen.getByText(/or click to select/i)).toBeInTheDocument()
  })

  it('displays correct file type acceptance message', () => {
    render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    expect(screen.getByText(/supports audio/i)).toBeInTheDocument()
    expect(screen.getByText(/wav, mp3, m4a/i)).toBeInTheDocument()
  })

  it('shows file name after file is selected', async () => {
    render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    const file = new File(['test'], 'test.wav', { type: 'audio/wav' })
    const input = screen.getByRole('presentation').querySelector('input[type="file"]')

    if (input) {
      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('test.wav')).toBeInTheDocument()
      })
    }
  })

  it('calls onUpload with selected files when upload button is clicked', async () => {
    render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    const file = new File(['test'], 'test.wav', { type: 'audio/wav' })
    const input = screen.getByRole('presentation').querySelector('input[type="file"]')

    if (input) {
      fireEvent.change(input, { target: { files: [file] } })

      // Wait for the upload button to appear (file added to state)
      const uploadButton = await waitFor(() => screen.getByText(/upload 1 file/i))
      fireEvent.click(uploadButton)

      expect(mockOnUpload).toHaveBeenCalledWith([file])
    }
  })

  it('calls onUpload with multiple files when upload button is clicked', async () => {
    render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    const file1 = new File(['test1'], 'test1.wav', { type: 'audio/wav' })
    const file2 = new File(['test2'], 'test2.mp3', { type: 'audio/mp3' })
    const input = screen.getByRole('presentation').querySelector('input[type="file"]')

    if (input) {
      fireEvent.change(input, { target: { files: [file1, file2] } })

      const uploadButton = await waitFor(() => screen.getByText(/upload 2 files/i))
      fireEvent.click(uploadButton)

      expect(mockOnUpload).toHaveBeenCalledWith([file1, file2])
    }
  })

  it('does not call onUpload when files are dropped without clicking the upload button', async () => {
    render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    const file = new File(['test'], 'test.wav', { type: 'audio/wav' })
    const input = screen.getByRole('presentation').querySelector('input[type="file"]')

    if (input) {
      fireEvent.change(input, { target: { files: [file] } })

      // File appears in list but onUpload not called yet
      await waitFor(() => expect(screen.getByText('test.wav')).toBeInTheDocument())
      expect(mockOnUpload).not.toHaveBeenCalled()
    }
  })

  it('shows uploading state when isUploading is true', async () => {
    const { rerender } = render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    const file = new File(['test'], 'test.wav', { type: 'audio/wav' })
    const input = screen.getByRole('presentation').querySelector('input[type="file"]')

    if (input) {
      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('test.wav')).toBeInTheDocument()
      })

      rerender(<FileUpload onUpload={mockOnUpload} isUploading={true} />)

      expect(screen.getByText(/uploading/i)).toBeInTheDocument()
    }
  })
})
