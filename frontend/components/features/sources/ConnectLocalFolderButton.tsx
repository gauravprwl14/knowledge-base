'use client';
import * as React from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/primitives/button/Button';
import { Input } from '@/components/primitives/input/Input';
import { Card, CardContent, CardHeader } from '@/components/primitives/card/Card';
import { useRegisterLocalSource } from '@/lib/hooks/use-sources';

/**
 * ConnectLocalFolderButton — renders a trigger button that expands into an
 * inline form for registering an arbitrary local directory as a source.
 */
export function ConnectLocalFolderButton() {
  const [open, setOpen] = React.useState(false);
  const [path, setPath] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const { mutate, isPending, error, reset } = useRegisterLocalSource();

  const handleConnect = () => {
    mutate(
      { path: path.trim(), displayName: displayName.trim() || undefined },
      { onSuccess: () => setOpen(false) },
    );
  };

  const handleCancel = () => {
    setOpen(false);
    reset();
  };

  if (!open) {
    return (
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        <FolderOpen className="mr-2 h-4 w-4" aria-hidden="true" />
        Connect Local Folder
      </Button>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-[var(--color-text-muted)]" aria-hidden="true" />
          <h3 className="font-semibold text-[var(--color-text-primary)]">Connect Local Folder</h3>
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Enter the absolute path to the directory you want to index.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Folder path */}
        <div>
          <label
            htmlFor="local-folder-path"
            className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
          >
            Folder Path
          </label>
          <Input
            id="local-folder-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/Users/you/Documents/Notes"
            prefix={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
          />
        </div>

        {/* Display name */}
        <div>
          <label
            htmlFor="local-display-name"
            className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
          >
            Display Name{' '}
            <span className="font-normal text-[var(--color-text-secondary)]">(optional)</span>
          </label>
          <Input
            id="local-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Work Notes"
          />
        </div>

        {/* Error feedback */}
        {error && (
          <p role="alert" className="text-sm text-[var(--color-status-error)]">
            Failed to connect folder. Check the path and try again.
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConnect}
            disabled={isPending || !path.trim()}
          >
            {isPending ? 'Connecting…' : 'Connect Folder'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
