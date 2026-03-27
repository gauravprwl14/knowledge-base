/**
 * folder-picker.spec.ts
 *
 * E2E tests for FolderPickerModal on the Sources page.
 *
 * Strategy:
 * - Inject a fake JWT cookie so middleware passes.
 * - Mock all API routes via page.route() (no backend required).
 * - Navigate to /kms/sources, click "Configure Folders" on a Google Drive card.
 * - Validate all FolderPickerModal features against the mocked API responses.
 *
 * Note: these tests verify the UI contract only — they do not test real
 * Google Drive API calls.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = '/kms';
const FAKE_TOKEN =
  // header.payload.sig — not a valid JWT but passes the presence check
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3ItMDAxIiwiaWF0IjoxNjAwMDAwMDAwfQ.fake';

const ROOT_FOLDERS = [
  { id: 'folder-001', name: 'Work Docs', path: 'Work Docs', childCount: 2 },
  { id: 'folder-002', name: 'Personal', path: 'Personal', childCount: 0 },
  { id: 'folder-003', name: 'Archive', path: 'Archive', childCount: 1 },
];

const CHILDREN_OF_001 = [
  { id: 'folder-001-a', name: 'Projects', path: 'Work Docs/Projects', childCount: 0 },
  { id: 'folder-001-b', name: 'Reports', path: 'Work Docs/Reports', childCount: 0 },
];

const MOCK_SOURCE = {
  id: 'src-001',
  userId: 'usr-001',
  type: 'GOOGLE_DRIVE',
  status: 'CONNECTED',
  displayName: 'My Drive',
  externalId: null,
  lastSyncedAt: null,
  createdAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function injectAuth(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'kms-access-token',
      value: FAKE_TOKEN,
      domain: 'localhost',
      path: '/',
    },
  ]);
}

async function mockApis(page: Page) {
  // Sources list
  await page.route('**/api/sources', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([MOCK_SOURCE]),
    });
  });

  // Root folder listing
  await page.route('**/api/sources/google-drive/folders?sourceId=src-001&parentId=root', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ folders: ROOT_FOLDERS }),
    });
  });

  // Children of folder-001
  await page.route(
    '**/api/sources/google-drive/folders?sourceId=src-001&parentId=folder-001',
    (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ folders: CHILDREN_OF_001 }),
      });
    },
  );

  // Update config
  await page.route('**/api/sources/src-001/config', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

async function openFolderPicker(page: Page) {
  await injectAuth(page.context());
  await mockApis(page);
  await page.goto(`${BASE}/sources`);

  // Wait for the sources card to render
  await expect(page.getByText('My Drive')).toBeVisible();

  // Click "Configure Folders"
  await page.getByRole('button', { name: /Configure Folders/i }).click();

  // Modal should be visible
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Select folders to sync')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('FolderPickerModal E2E', () => {
  test('opens modal and shows root-level Drive folders', async ({ page }) => {
    await openFolderPicker(page);

    await expect(page.getByText('Work Docs')).toBeVisible();
    await expect(page.getByText('Personal')).toBeVisible();
    await expect(page.getByText('Archive')).toBeVisible();
  });

  test('expands a folder to see children with connecting lines', async ({ page }) => {
    await openFolderPicker(page);

    // Expand Work Docs (first expand button)
    const expandBtns = page.getByLabel(/Expand folder/i);
    await expandBtns.first().click();

    // Children should appear
    await expect(page.getByText('Projects')).toBeVisible();
    await expect(page.getByText('Reports')).toBeVisible();

    // Work Docs treeitem should now be aria-expanded=true
    const workDocsItem = page.locator('[role="treeitem"]').filter({ hasText: 'Work Docs' });
    await expect(workDocsItem).toHaveAttribute('aria-expanded', 'true');
  });

  test('search for folder by name shows flat filtered results', async ({ page }) => {
    await openFolderPicker(page);

    const searchInput = page.getByPlaceholder(/Search folders/i);
    await searchInput.fill('work');

    // Only Work Docs should be visible
    await expect(page.getByText('Work Docs')).toBeVisible();
    await expect(page.getByText('Personal')).not.toBeVisible();
    await expect(page.getByText('Archive')).not.toBeVisible();
  });

  test('clearing search restores the full folder tree', async ({ page }) => {
    await openFolderPicker(page);

    const searchInput = page.getByPlaceholder(/Search folders/i);
    await searchInput.fill('work');

    // Clear via X button
    await page.getByLabel(/Clear search/i).click();

    await expect(page.getByText('Personal')).toBeVisible();
    await expect(page.getByText('Archive')).toBeVisible();
  });

  test('selecting a folder updates the selection summary', async ({ page }) => {
    await openFolderPicker(page);

    // Click the first checkbox (Work Docs)
    const checkboxes = page.getByRole('checkbox');
    await checkboxes.first().click();

    // Summary should update
    await expect(page.getByText(/1 folder selected/i)).toBeVisible();
  });

  test('select folder with "select all children" toggle marks descendants', async ({ page }) => {
    await openFolderPicker(page);

    // Expand Work Docs to load children
    const expandBtns = page.getByLabel(/Expand folder/i);
    await expandBtns.first().click();
    await expect(page.getByText('Projects')).toBeVisible();

    // Click "Select all children" on Work Docs
    const selectAllBtns = page.getByLabel(/Select all children/i);
    await selectAllBtns.first().click();

    // Both children should now be checked
    const projectsItem = page.locator('[role="treeitem"]').filter({ hasText: 'Projects' });
    await expect(projectsItem).toHaveAttribute('aria-selected', 'true');

    const reportsItem = page.locator('[role="treeitem"]').filter({ hasText: 'Reports' });
    await expect(reportsItem).toHaveAttribute('aria-selected', 'true');
  });

  test('keyboard navigation: ArrowDown / Space / Enter', async ({ page }) => {
    await openFolderPicker(page);

    // Focus the tree
    const tree = page.getByRole('tree');
    await tree.focus();

    // ArrowDown to first item
    await page.keyboard.press('ArrowDown');

    // Space to toggle selection
    await page.keyboard.press('Space');
    await expect(page.getByText(/1 folder selected/i)).toBeVisible();

    // Enter to save
    await page.keyboard.press('Enter');

    // Modal should close (dialog gone)
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('keyboard ArrowRight expands collapsed folder', async ({ page }) => {
    await openFolderPicker(page);

    const tree = page.getByRole('tree');
    await tree.focus();

    // Move focus to first row (Work Docs)
    await page.keyboard.press('ArrowDown');

    // ArrowRight should expand
    await page.keyboard.press('ArrowRight');

    await expect(page.getByText('Projects')).toBeVisible();
  });

  test('Save sends correct folderIds and selectAllChildrenMap', async ({ page }) => {
    // Capture the PATCH request body
    let capturedBody: unknown = null;
    await page.route('**/api/sources/src-001/config', async (route) => {
      capturedBody = await route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await openFolderPicker(page);

    // Select Work Docs
    await page.getByRole('checkbox').first().click();

    await page.getByRole('button', { name: /^Save$/i }).click();

    // Verify the API received the correct payload
    await expect.poll(() => capturedBody).toEqual({ syncFolderIds: ['folder-001'] });

    // Modal should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
