/**
 * Unit tests for root page (redirect to dashboard)
 */
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

import { redirect } from 'next/navigation'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import RootPage from '@/app/page'

describe('RootPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects to /dashboard', () => {
    render(<RootPage />)
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('calls redirect exactly once', () => {
    render(<RootPage />)
    expect(redirect).toHaveBeenCalledTimes(1)
  })
})
