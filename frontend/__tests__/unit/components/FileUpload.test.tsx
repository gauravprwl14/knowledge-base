/**
 * Unit tests for FileUpload component
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

  it('shows uploading state when isUploading is true', async () => {
    const { rerender } = render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    // First add a file
    const file = new File(['test'], 'test.wav', { type: 'audio/wav' })
    const input = screen.getByRole('presentation').querySelector('input[type="file"]')

    if (input) {
      fireEvent.change(input, { target: { files: [file] } })

      // Wait for file to appear
      await waitFor(() => {
        expect(screen.getByText('test.wav')).toBeInTheDocument()
      })

      // Rerender with isUploading true
      rerender(<FileUpload onUpload={mockOnUpload} isUploading={true} />)

      // Now check for uploading text
      expect(screen.getByText(/uploading/i)).toBeInTheDocument()
    }
  })

  it('accepts file selection', async () => {
    render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    const file = new File(['test'], 'test.wav', { type: 'audio/wav' })
    const input = screen.getByRole('presentation').querySelector('input[type="file"]')

    if (input) {
      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith([file])
      })
    }
  })

  it('accepts multiple files', async () => {
    render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    const file1 = new File(['test1'], 'test1.wav', { type: 'audio/wav' })
    const file2 = new File(['test2'], 'test2.mp3', { type: 'audio/mp3' })
    const input = screen.getByRole('presentation').querySelector('input[type="file"]')

    if (input) {
      fireEvent.change(input, { target: { files: [file1, file2] } })

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith([file1, file2])
      })
    }
  })

  it('displays correct file type acceptance message', () => {
    render(<FileUpload onUpload={mockOnUpload} isUploading={false} />)

    expect(screen.getByText(/supports audio/i)).toBeInTheDocument()
    expect(screen.getByText(/wav, mp3, m4a/i)).toBeInTheDocument()
  })
})
