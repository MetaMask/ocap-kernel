import {
  Box,
  Text as TextComponent,
  TextVariant,
  TextColor,
  Button,
  ButtonVariant,
  ButtonSize,
} from '@metamask/design-system-react';
import { useCallback, useEffect, useState } from 'react';

import { capletInstallerService } from '../services/caplet-installer.ts';
import { uiRendererService } from '../services/ui-renderer.ts';
import type { InstalledCaplet } from '../types/caplet.ts';

/**
 * Component for listing and managing installed caplets.
 */
export const InstalledCaplets: React.FC = () => {
  const [caplets, setCaplets] = useState<InstalledCaplet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCaplets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const installed = await capletInstallerService.getInstalledCaplets();
      setCaplets(installed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaplets();
  }, [loadCaplets]);

  const handleUninstall = useCallback(
    async (capletId: string) => {
      if (!confirm(`Are you sure you want to uninstall ${capletId}?`)) {
        return;
      }
      try {
        await capletInstallerService.uninstallCaplet(capletId);
        await loadCaplets();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadCaplets],
  );

  const handleToggleEnabled = useCallback(
    async (capletId: string, enabled: boolean) => {
      try {
        await capletInstallerService.setCapletEnabled(capletId, !enabled);
        await loadCaplets();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadCaplets],
  );

  const handleRenderUI = useCallback(async (caplet: InstalledCaplet) => {
    try {
      const container = document.getElementById('caplet-ui-container');
      if (!container) {
        throw new Error('UI container not found');
      }
      await uiRendererService.renderCapletUI(
        caplet.id,
        caplet,
        caplet.manifest.ui?.mountPoint ?? 'popup',
        container,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <Box className="p-4">
      <TextComponent
        variant={TextVariant.HeadingMd}
        color={TextColor.TextDefault}
        className="mb-4"
      >
        Installed Caplets
      </TextComponent>

      {error && (
        <Box className="mb-4 p-2 bg-error-muted rounded">
          <TextComponent
            variant={TextVariant.BodySm}
            color={TextColor.ErrorDefault}
          >
            Error: {error}
          </TextComponent>
        </Box>
      )}

      {loading && caplets.length === 0 && (
        <TextComponent variant={TextVariant.BodySm} color={TextColor.TextMuted}>
          Loading caplets...
        </TextComponent>
      )}

      {!loading && caplets.length === 0 && (
        <TextComponent variant={TextVariant.BodySm} color={TextColor.TextMuted}>
          No caplets installed. Install caplets from the Caplet Store.
        </TextComponent>
      )}

      <div className="flex flex-col gap-4">
        {caplets.map((caplet) => (
          <Box
            key={caplet.id}
            className="p-4 border border-muted rounded bg-section"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <TextComponent
                  variant={TextVariant.BodyMd}
                  color={TextColor.TextDefault}
                  className="font-semibold"
                >
                  {caplet.manifest.name}
                </TextComponent>
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextMuted}
                >
                  v{caplet.manifest.version}
                  {caplet.enabled === false && ' (disabled)'}
                </TextComponent>
              </div>
              <div className="flex gap-2">
                {caplet.manifest.ui && (
                  <Button
                    variant={ButtonVariant.Secondary}
                    size={ButtonSize.Sm}
                    onClick={async () => handleRenderUI(caplet)}
                  >
                    Show UI
                  </Button>
                )}
                <Button
                  variant={ButtonVariant.Secondary}
                  size={ButtonSize.Sm}
                  onClick={async () =>
                    handleToggleEnabled(caplet.id, caplet.enabled ?? true)
                  }
                >
                  {caplet.enabled === false ? 'Enable' : 'Disable'}
                </Button>
                <Button
                  variant={ButtonVariant.Secondary}
                  size={ButtonSize.Sm}
                  onClick={async () => handleUninstall(caplet.id)}
                >
                  Uninstall
                </Button>
              </div>
            </div>
            {caplet.manifest.description && (
              <TextComponent
                variant={TextVariant.BodySm}
                color={TextColor.TextAlternative}
                className="mt-2"
              >
                {caplet.manifest.description}
              </TextComponent>
            )}
          </Box>
        ))}
      </div>
    </Box>
  );
};
