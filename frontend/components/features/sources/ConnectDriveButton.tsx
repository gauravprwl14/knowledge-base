'use client';
import * as React from 'react';
import { HardDrive } from 'lucide-react';
import { Button } from '@/components/primitives/button/Button';
import { kmsSourcesApi } from '@/lib/api/sources';

export interface ConnectDriveButtonProps {
  /** Authenticated user UUID — passed as the OAuth state parameter */
  userId: string;
  /**
   * When false the button is rendered in a disabled state with a tooltip
   * explaining that the feature is not yet available.
   */
  enabled: boolean;
}

/**
 * ConnectDriveButton — triggers the Google Drive OAuth flow on click.
 *
 * The click handler performs a full-page redirect to the backend's
 * /sources/google-drive/oauth endpoint, which in turn redirects the browser
 * to the Google consent screen.
 *
 * When the `enabled` flag is false (feature flag off) the button is disabled
 * and a tooltip message is shown via the `title` attribute.
 */
export function ConnectDriveButton({ userId, enabled }: ConnectDriveButtonProps) {
  const handleClick = () => {
    if (!enabled) return;
    kmsSourcesApi.initiateGoogleDrive(userId);
  };

  return (
    <Button
      variant="primary"
      size="md"
      onClick={handleClick}
      disabled={!enabled}
      title={
        enabled
          ? 'Connect your Google Drive account'
          : 'Google Drive integration is not yet available'
      }
      aria-disabled={!enabled}
    >
      <HardDrive className="mr-2 h-4 w-4" aria-hidden="true" />
      Connect Google Drive
    </Button>
  );
}
