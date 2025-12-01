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
import { capletRegistryService } from '../services/caplet-registry.ts';
import type { CapletManifest } from '../types/caplet.ts';

/**
 * Component for browsing and installing caplets from registries.
 */
export const CapletStore: React.FC = () => {
  const [caplets, setCaplets] = useState<CapletManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCaplets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const discovered = await capletRegistryService.discoverCaplets();
      setCaplets(discovered);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaplets();
  }, [loadCaplets]);

  const handleInstall = useCallback(
    async (manifest: CapletManifest) => {
      try {
        await capletInstallerService.installCaplet(manifest);
        // Refresh the list
        await loadCaplets();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadCaplets],
  );

  return (
    <Box className="p-4">
      <TextComponent
        variant={TextVariant.HeadingMd}
        color={TextColor.TextDefault}
        className="mb-4"
      >
        Caplet Store
      </TextComponent>

      <Button
        variant={ButtonVariant.Secondary}
        size={ButtonSize.Sm}
        onClick={loadCaplets}
        disabled={loading}
        className="mb-4"
      >
        {loading ? 'Loading...' : 'Refresh'}
      </Button>

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

      {!loading && caplets.length === 0 && !error && (
        <TextComponent variant={TextVariant.BodySm} color={TextColor.TextMuted}>
          No caplets found. Add a registry to discover caplets.
        </TextComponent>
      )}

      <div className="flex flex-col gap-4">
        {caplets.map((caplet) => (
          <Box
            key={`${caplet.name}@${caplet.version}`}
            className="p-4 border border-muted rounded bg-section"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <TextComponent
                  variant={TextVariant.BodyMd}
                  color={TextColor.TextDefault}
                  className="font-semibold"
                >
                  {caplet.name}
                </TextComponent>
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextMuted}
                >
                  v{caplet.version}
                </TextComponent>
              </div>
              <Button
                variant={ButtonVariant.Primary}
                size={ButtonSize.Sm}
                onClick={async () => handleInstall(caplet)}
              >
                Install
              </Button>
            </div>
            {caplet.description && (
              <TextComponent
                variant={TextVariant.BodySm}
                color={TextColor.TextAlternative}
                className="mt-2"
              >
                {caplet.description}
              </TextComponent>
            )}
          </Box>
        ))}
      </div>
    </Box>
  );
};
