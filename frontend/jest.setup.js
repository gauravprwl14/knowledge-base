import '@testing-library/jest-dom'

// Mock environment variables
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000'

// Mock fetch for tests (except when using MSW)
if (!process.env.USE_MSW) {
  global.fetch = jest.fn()
}

// Polyfill for TextEncoder/TextDecoder (required by MSW)
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util')
  global.TextEncoder = TextEncoder
  global.TextDecoder = TextDecoder
}

// Polyfill for ReadableStream (required by MSW)
if (typeof ReadableStream === 'undefined') {
  const polyfill = require('web-streams-polyfill')
  global.ReadableStream = polyfill.ReadableStream
}

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks()
})
