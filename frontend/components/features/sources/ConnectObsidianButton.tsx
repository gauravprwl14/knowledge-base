'use client';
import * as React from 'react';
import { BookOpen, FolderOpen } from 'lucide-react';
import { Button } from '@/components/primitives/button/Button';
import { Input } from '@/components/primitives/input/Input';
import { Card, CardContent, CardHeader } from '@/components/primitives/card/Card';
import { useRegisterObsidianVault } from '@/lib/hooks/use-sources';

/**
 * ConnectObsidianButton — renders a trigger button that expands into an inline
 * form for registering an Obsidian vault by filesystem path.
 *
 * No feature flag is required; Obsidian vaults are always available.
 */
export function ConnectObsidianButton() {
  const [open, setOpen] = React.useState(false);
  const [vaultPath, setVaultPath] = React.useState('/vault');
  const [displayName, setDisplayName] = React.useState('');
  const { mutate, isPending, error, reset } = useRegisterObsidianVault();

  const handleConnect = () => {
    mutate(
      { vaultPath: vaultPath.trim(), displayName: displayName.trim() || undefined },
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
        <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
        Connect Obsidian Vault
      </Button>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-[var(--color-text-muted)]" aria-hidden="true" />
          <h3 className="font-semibold text-[var(--color-text-primary)]">Connect Obsidian Vault</h3>
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Enter the vault path. In Docker use{' '}
          <code className="rounded bg-[var(--color-bg-secondary)] px-1 text-xs">/vault</code>{' '}
          (mounted from{' '}
          <code className="rounded bg-[var(--color-bg-secondary)] px-1 text-xs">./test-vault</code>
          ).
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Vault path */}
        <div>
          <label
            htmlFor="obsidian-vault-path"
            className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
          >
            Vault Path
          </label>
          <Input
            id="obsidian-vault-path"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
            placeholder="/vault or /Users/you/Documents/MyVault"
            prefix={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
            aria-describedby="obsidian-vault-path-hint"
          />
          <p
            id="obsidian-vault-path-hint"
            className="mt-1 text-xs text-[var(--color-text-secondary)]"
          >
            Docker default: <strong>/vault</strong> (maps to{' '}
            <code className="text-xs">test-vault/</code> in the project root)
          </p>
        </div>

        {/* Display name */}
        <div>
          <label
            htmlFor="obsidian-display-name"
            className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
          >
            Display Name{' '}
            <span className="font-normal text-[var(--color-text-secondary)]">(optional)</span>
          </label>
          <Input
            id="obsidian-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My Knowledge Base"
          />
        </div>

        {/* Error feedback */}
        {error && (
          <p role="alert" className="text-sm text-[var(--color-status-error)]">
            Failed to connect vault. Check the path and try again.
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
            disabled={isPending || !vaultPath.trim()}
          >
            {isPending ? 'Connecting…' : 'Connect Vault'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
