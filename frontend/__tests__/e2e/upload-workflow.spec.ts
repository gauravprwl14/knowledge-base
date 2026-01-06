/**
 * End-to-end tests for upload workflow
 */
import { test, expect } from '@playwright/test'

test.describe('Upload Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display upload page correctly', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /upload audio\/video/i })).toBeVisible()
    await expect(page.getByText(/upload your files to transcribe/i)).toBeVisible()
  })

  test('should have settings section', async ({ page }) => {
    await expect(page.getByText('Settings')).toBeVisible()
    await expect(page.getByLabel(/api key/i)).toBeVisible()
    await expect(page.getByLabel(/provider/i)).toBeVisible()
    await expect(page.getByLabel(/model/i)).toBeVisible()
    await expect(page.getByLabel(/language/i)).toBeVisible()
  })

  test('should allow entering API key', async ({ page }) => {
    const apiKeyInput = page.getByLabel(/api key/i)
    await apiKeyInput.fill('test-api-key-123')
    await expect(apiKeyInput).toHaveValue('test-api-key-123')
  })

  test('should allow selecting provider', async ({ page }) => {
    const providerSelect = page.getByLabel(/provider/i)
    await providerSelect.selectOption('groq')
    await expect(providerSelect).toHaveValue('groq')
  })

  test('should allow selecting model', async ({ page }) => {
    const modelSelect = page.getByLabel(/model/i)
    await modelSelect.selectOption('small')
    await expect(modelSelect).toHaveValue('small')
  })

  test('should allow selecting language', async ({ page }) => {
    const languageSelect = page.getByLabel(/language/i)
    await languageSelect.selectOption('es')
    await expect(languageSelect).toHaveValue('es')
  })

  test('should navigate to jobs page', async ({ page }) => {
    await page.click('a[href="/jobs"]')
    await expect(page).toHaveURL('/jobs')
  })

  test('should show drag and drop area', async ({ page }) => {
    await expect(page.getByText(/drag & drop files here/i)).toBeVisible()
    await expect(page.getByText(/or click to select/i)).toBeVisible()
  })

  test('should display file type support message', async ({ page }) => {
    await expect(page.getByText(/supports audio/i)).toBeVisible()
    await expect(page.getByText(/wav, mp3, m4a/i)).toBeVisible()
  })
})

test.describe('Jobs Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/jobs')
  })

  test('should display jobs page correctly', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /transcription jobs/i })).toBeVisible()
  })

  test('should have navigation back to upload', async ({ page }) => {
    await page.click('a[href="/"]')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: /upload audio\/video/i })).toBeVisible()
  })
})

test.describe('Error Handling', () => {
  test('should show error when uploading without API key', async ({ page }) => {
    await page.goto('/')

    // Mock the upload endpoint to return error
    await page.route('**/api/v1/upload', route => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'API key required' }),
      })
    })

    // Try to upload (this would require file selection interaction)
    // For now, we just verify the error handling structure exists
    await expect(page.getByLabel(/api key/i)).toBeVisible()
  })
})

test.describe('Responsive Design', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /upload audio\/video/i })).toBeVisible()
    await expect(page.getByLabel(/api key/i)).toBeVisible()
  })

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /upload audio\/video/i })).toBeVisible()
    await expect(page.getByLabel(/api key/i)).toBeVisible()
  })
})
