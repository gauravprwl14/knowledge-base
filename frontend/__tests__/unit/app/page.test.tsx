/**
 * Unit tests for main upload page
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import HomePage from '@/app/page'

// Mock FileUpload component
jest.mock('@/components/FileUpload', () => {
  return function MockFileUpload({ onUpload, isUploading }: any) {
    return (
      <div data-testid="file-upload">
        <button
          onClick={() => onUpload([new File(['test'], 'test.wav')])}
          disabled={isUploading}
        >
          Upload
        </button>
        {isUploading && <div>Uploading...</div>}
      </div>
    )
  }
})

describe('HomePage', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('renders upload page with title', () => {
    render(<HomePage />)

    expect(screen.getByText('Upload Audio/Video')).toBeInTheDocument()
    expect(screen.getByText(/upload your files to transcribe/i)).toBeInTheDocument()
  })

  it('renders settings section', () => {
    render(<HomePage />)

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/provider/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/language/i)).toBeInTheDocument()
  })

  it('allows user to enter API key', () => {
    render(<HomePage />)

    const apiKeyInput = screen.getByLabelText(/api key/i) as HTMLInputElement
    fireEvent.change(apiKeyInput, { target: { value: 'test-key-123' } })

    expect(apiKeyInput.value).toBe('test-key-123')
  })

  it('allows user to select provider', () => {
    render(<HomePage />)

    const providerSelect = screen.getByLabelText(/provider/i) as HTMLSelectElement
    fireEvent.change(providerSelect, { target: { value: 'groq' } })

    expect(providerSelect.value).toBe('groq')
  })

  it('allows user to select model', () => {
    render(<HomePage />)

    const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement
    fireEvent.change(modelSelect, { target: { value: 'small' } })

    expect(modelSelect.value).toBe('small')
  })

  it('allows user to select language', () => {
    render(<HomePage />)

    const languageSelect = screen.getByLabelText(/language/i) as HTMLSelectElement
    fireEvent.change(languageSelect, { target: { value: 'es' } })

    expect(languageSelect.value).toBe('es')
  })

  it('shows error when upload fails without API key', async () => {
    render(<HomePage />)

    const uploadButton = screen.getByText('Upload')
    fireEvent.click(uploadButton)

    await waitFor(() => {
      expect(screen.getByText(/please enter your api key/i)).toBeInTheDocument()
    })
  })

  it('uploads file successfully with API key', async () => {
    const mockResponse = {
      job_id: 'test-job-123',
      filename: 'test.wav',
      status: 'queued',
    }

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    render(<HomePage />)

    // Enter API key
    const apiKeyInput = screen.getByLabelText(/api key/i)
    fireEvent.change(apiKeyInput, { target: { value: 'test-key-123' } })

    // Click upload
    const uploadButton = screen.getByText('Upload')
    fireEvent.click(uploadButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/upload',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-Key': 'test-key-123',
          }),
        })
      )
    })
  })

  it('displays uploaded files', async () => {
    const mockResponse = {
      job_id: 'test-job-123',
      filename: 'test.wav',
      status: 'queued',
    }

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    render(<HomePage />)

    // Enter API key and upload
    const apiKeyInput = screen.getByLabelText(/api key/i)
    fireEvent.change(apiKeyInput, { target: { value: 'test-key-123' } })

    const uploadButton = screen.getByText('Upload')
    fireEvent.click(uploadButton)

    await waitFor(() => {
      expect(screen.getByText('Uploaded Files')).toBeInTheDocument()
      expect(screen.getByText('test.wav')).toBeInTheDocument()
    })
  })

  it('handles upload error correctly', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ detail: 'Invalid API key' }),
      headers: new Headers({ 'content-type': 'application/json' }),
    })

    render(<HomePage />)

    const apiKeyInput = screen.getByLabelText(/api key/i)
    fireEvent.change(apiKeyInput, { target: { value: 'invalid-key' } })

    const uploadButton = screen.getByText('Upload')
    fireEvent.click(uploadButton)

    await waitFor(() => {
      expect(screen.getByText(/invalid api key/i)).toBeInTheDocument()
    })
  })
})
