/**
 * SettingsPage.test.tsx
 *
 * Unit tests for the Settings page.
 *
 * Covers:
 * 1. Profile section shows user name and email from auth store
 * 2. API keys section lists keys
 * 3. Generate key button opens modal
 * 4. Revoke key calls settingsApi.revokeApiKey
 * 5. Preferences section saves to localStorage
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// settings API
const mockListApiKeys = jest.fn();
const mockCreateApiKey = jest.fn();
const mockRevokeApiKey = jest.fn();
const mockUpdateProfile = jest.fn();

jest.mock('@/lib/api/settings', () => ({
  settingsApi: {
    listApiKeys: (...args: unknown[]) => mockListApiKeys(...args),
    createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
    revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  },
}));

// auth store — return a controllable user
const mockUseCurrentUser = jest.fn();
const mockUseAccessToken = jest.fn(() => 'mock-access-token');
const mockLoginStore = jest.fn();

jest.mock('@/lib/stores/auth.store', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
  useAccessToken: () => mockUseAccessToken(),
  login: (...args: unknown[]) => mockLoginStore(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from '@/components/features/settings/SettingsPage';
import type { ApiKey } from '@/lib/api/settings';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'user-001',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['user'],
};

const MOCK_API_KEYS: ApiKey[] = [
  {
    id: 'sk-001',
    name: 'Production Key',
    keyPreview: 'kms_prod_••••••••',
    createdAt: '2025-02-10T09:00:00.000Z',
    lastUsedAt: '2025-03-15T12:00:00.000Z',
  },
  {
    id: 'sk-002',
    name: 'Dev Key',
    keyPreview: 'kms_dev_••••••••',
    createdAt: '2025-01-05T11:00:00.000Z',
    lastUsedAt: null,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSettings() {
  return render(<SettingsPage />);
}

function navigateTo(sectionLabel: string) {
  const btn = screen.getByRole('button', { name: sectionLabel });
  fireEvent.click(btn);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCurrentUser.mockReturnValue(MOCK_USER);
  mockUseAccessToken.mockReturnValue('mock-access-token');
  mockListApiKeys.mockResolvedValue(MOCK_API_KEYS);
  mockRevokeApiKey.mockResolvedValue(undefined);
  mockCreateApiKey.mockResolvedValue({ key: 'kms_new_full_key_abc', id: 'sk-new' });
  mockUpdateProfile.mockResolvedValue({ ...MOCK_USER, name: 'Updated Name' });

  // Clear relevant localStorage keys between tests
  localStorage.removeItem('kms.theme');
  localStorage.removeItem('kms.pageSize');
  localStorage.removeItem('kms.emailDigest');
});

// ---------------------------------------------------------------------------
// 1. Profile section — shows name + email from auth store
// ---------------------------------------------------------------------------

describe('Profile section', () => {
  it('shows the user name and email from the auth store', () => {
    renderSettings();
    // Profile tab is active by default
    expect(screen.getByText('Test User')).toBeInTheDocument();
    // Email appears in both profile card and account info row
    const emailEls = screen.getAllByText('test@example.com');
    expect(emailEls.length).toBeGreaterThanOrEqual(1);
  });

  it('shows avatar initials from user name', () => {
    renderSettings();
    const avatar = screen.getByLabelText('Avatar for Test User');
    expect(avatar).toHaveTextContent('T');
  });

  it('falls back to email initial when name is empty', () => {
    mockUseCurrentUser.mockReturnValue({ ...MOCK_USER, name: '' });
    renderSettings();
    // When name is empty, avatar label uses email
    const avatar = screen.getByLabelText('Avatar for test@example.com');
    expect(avatar).toHaveTextContent('T'); // first char of email
  });

  it('shows loading state when user is null', () => {
    mockUseCurrentUser.mockReturnValue(null);
    renderSettings();
    expect(screen.getByText('Loading profile…')).toBeInTheDocument();
  });

  it('inline edit calls settingsApi.updateProfile and syncs store', async () => {
    renderSettings();
    // Click "Edit profile" button
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    const input = screen.getByLabelText('Display name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Updated Name');
    // Click save (check icon)
    fireEvent.click(screen.getByRole('button', { name: 'Save display name' }));
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith('Updated Name');
    });
    await waitFor(() => {
      expect(mockLoginStore).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. API Keys section — lists keys
// ---------------------------------------------------------------------------

describe('API Keys section', () => {
  beforeEach(() => {
    renderSettings();
    navigateTo('API Keys');
  });

  it('shows loading spinner while fetching', () => {
    // listApiKeys never resolves in this check — already loading on navigation
    expect(screen.getByLabelText('Loading API keys')).toBeInTheDocument();
  });

  it('lists API keys after loading', async () => {
    await waitFor(() => {
      expect(screen.getByText('Production Key')).toBeInTheDocument();
    });
    expect(screen.getByText('Dev Key')).toBeInTheDocument();
  });

  it('shows key preview in each row', async () => {
    await waitFor(() => {
      expect(screen.getByText('kms_prod_••••••••')).toBeInTheDocument();
    });
  });

  it('shows "Never" for lastUsedAt when null', async () => {
    await waitFor(() => {
      expect(screen.getByText(/Last used: Never/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Generate key button shows modal
// ---------------------------------------------------------------------------

describe('Generate API key modal', () => {
  beforeEach(async () => {
    renderSettings();
    navigateTo('API Keys');
    // Wait for list to load
    await waitFor(() => screen.getByText('Production Key'));
  });

  it('opens modal when "Generate new key" is clicked', () => {
    fireEvent.click(screen.getByRole('button', { name: /Generate new key/i }));
    expect(screen.getByRole('dialog', { name: 'Generate API key' })).toBeInTheDocument();
  });

  it('shows validation error when name is empty', async () => {
    fireEvent.click(screen.getByRole('button', { name: /Generate new key/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate key' }));
    await waitFor(() => {
      expect(screen.getByText('Key name is required.')).toBeInTheDocument();
    });
    expect(mockCreateApiKey).not.toHaveBeenCalled();
  });

  it('calls createApiKey with the entered name', async () => {
    fireEvent.click(screen.getByRole('button', { name: /Generate new key/i }));
    const input = screen.getByLabelText(/Key name/i);
    await userEvent.type(input, 'My new key');
    fireEvent.click(screen.getByRole('button', { name: 'Generate key' }));
    await waitFor(() => {
      expect(mockCreateApiKey).toHaveBeenCalledWith('My new key');
    });
  });

  it('shows the generated key in the success state', async () => {
    fireEvent.click(screen.getByRole('button', { name: /Generate new key/i }));
    const input = screen.getByLabelText(/Key name/i);
    await userEvent.type(input, 'Test key');
    fireEvent.click(screen.getByRole('button', { name: 'Generate key' }));
    await waitFor(() => {
      expect(screen.getByText('kms_new_full_key_abc')).toBeInTheDocument();
    });
    // Security warning
    expect(screen.getByText(/Save this key now/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Revoke key calls settingsApi.revokeApiKey
// ---------------------------------------------------------------------------

describe('Revoke API key', () => {
  beforeEach(async () => {
    renderSettings();
    navigateTo('API Keys');
    await waitFor(() => screen.getByText('Production Key'));
  });

  it('shows confirm dialog before revoking', async () => {
    const revokeBtn = screen.getAllByRole('button', { name: /Revoke API key/i })[0];
    fireEvent.click(revokeBtn);
    expect(screen.getByRole('dialog', { name: 'Revoke API key?' })).toBeInTheDocument();
    // "Production Key" appears in both the key list and the confirm dialog
    const mentions = screen.getAllByText(/Production Key/);
    expect(mentions.length).toBeGreaterThanOrEqual(1);
  });

  it('calls settingsApi.revokeApiKey when confirmed', async () => {
    const revokeBtn = screen.getAllByRole('button', { name: /Revoke API key "Production Key"/i })[0];
    fireEvent.click(revokeBtn);
    // Confirm in dialog
    const confirmBtn = screen.getByRole('button', { name: 'Revoke key' });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await waitFor(() => {
      expect(mockRevokeApiKey).toHaveBeenCalledWith('sk-001');
    });
  });

  it('removes the key from the list after successful revoke', async () => {
    const revokeBtn = screen.getAllByRole('button', { name: /Revoke API key "Production Key"/i })[0];
    fireEvent.click(revokeBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }));
    await waitFor(() => {
      expect(screen.queryByText('Production Key')).not.toBeInTheDocument();
    });
  });

  it('does NOT call revokeApiKey when cancelled', async () => {
    const revokeBtn = screen.getAllByRole('button', { name: /Revoke API key "Production Key"/i })[0];
    fireEvent.click(revokeBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockRevokeApiKey).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Preferences section saves to localStorage
// ---------------------------------------------------------------------------

describe('Preferences section', () => {
  beforeEach(() => {
    renderSettings();
    navigateTo('Preferences');
  });

  it('renders theme, page size, and notification options', () => {
    expect(screen.getByRole('button', { name: /Dark/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /System/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '50' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '100' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email digest notifications')).toBeInTheDocument();
  });

  it('saves theme to localStorage on "Save preferences"', () => {
    fireEvent.click(screen.getByRole('button', { name: /System/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save preferences/i }));
    expect(localStorage.getItem('kms.theme')).toBe('system');
  });

  it('saves page size to localStorage on "Save preferences"', () => {
    fireEvent.click(screen.getByRole('button', { name: '50' }));
    fireEvent.click(screen.getByRole('button', { name: /Save preferences/i }));
    expect(localStorage.getItem('kms.pageSize')).toBe('50');
  });

  it('saves email digest preference to localStorage', () => {
    const toggle = screen.getByLabelText('Email digest notifications');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /Save preferences/i }));
    expect(localStorage.getItem('kms.emailDigest')).toBe('true');
  });

  it('shows "Saved!" confirmation after saving', async () => {
    fireEvent.click(screen.getByRole('button', { name: /Save preferences/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Preferences saved.');
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Danger Zone section
// ---------------------------------------------------------------------------

describe('Danger Zone section', () => {
  beforeEach(() => {
    renderSettings();
    navigateTo('Danger Zone');
  });

  it('renders the Delete account button', () => {
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument();
  });

  it('opens confirmation modal when delete button clicked', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByRole('dialog', { name: 'Delete account' })).toBeInTheDocument();
  });

  it('disables confirm button until correct email is typed', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const confirmBtn = screen.getByRole('button', { name: 'Delete my account' });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByLabelText(/Type your email address/i);
    fireEvent.change(input, { target: { value: 'wrong@example.com' } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'test@example.com' } });
    expect(confirmBtn).not.toBeDisabled();
  });
});
