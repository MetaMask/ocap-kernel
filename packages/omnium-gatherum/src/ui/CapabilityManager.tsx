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

import { capabilityManagerService } from '../services/capability-manager.ts';
import { capletInstallerService } from '../services/caplet-installer.ts';
import type { CapabilityGrant, InstalledCaplet } from '../types/caplet.ts';

/**
 * Component for viewing and managing capability grants.
 */
export const CapabilityManager: React.FC = () => {
  const [caplets, setCaplets] = useState<InstalledCaplet[]>([]);
  const [grants, setGrants] = useState<CapabilityGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCapletId, setSelectedCapletId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [installedCaplets, allGrants] = await Promise.all([
        capletInstallerService.getInstalledCaplets(),
        capabilityManagerService.getAllGrants(),
      ]);
      setCaplets(installedCaplets);
      setGrants(allGrants);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRevoke = useCallback(
    async (capletId: string, capabilityName: string) => {
      if (
        !confirm(
          `Are you sure you want to revoke capability "${capabilityName}" from ${capletId}?`,
        )
      ) {
        return;
      }
      try {
        await capabilityManagerService.revokeCapability(
          capletId,
          capabilityName,
        );
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadData],
  );

  const filteredGrants = selectedCapletId
    ? grants.filter((grant) => grant.capletId === selectedCapletId)
    : grants;

  return (
    <Box className="p-4">
      <TextComponent
        variant={TextVariant.HeadingMd}
        color={TextColor.TextDefault}
        className="mb-4"
      >
        Capability Manager
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

      <div className="mb-4">
        <TextComponent
          variant={TextVariant.BodySm}
          color={TextColor.TextMuted}
          className="mb-2"
        >
          Filter by caplet:
        </TextComponent>
        <select
          value={selectedCapletId ?? ''}
          onChange={(e) => setSelectedCapletId(e.target.value || null)}
          className="p-2 border border-muted rounded bg-section"
        >
          <option value="">All caplets</option>
          {caplets.map((caplet) => (
            <option key={caplet.id} value={caplet.id}>
              {caplet.manifest.name}@{caplet.manifest.version}
            </option>
          ))}
        </select>
      </div>

      {loading && grants.length === 0 && (
        <TextComponent variant={TextVariant.BodySm} color={TextColor.TextMuted}>
          Loading capabilities...
        </TextComponent>
      )}

      {!loading && filteredGrants.length === 0 && (
        <TextComponent variant={TextVariant.BodySm} color={TextColor.TextMuted}>
          No capabilities granted
          {selectedCapletId ? ' for this caplet' : ''}.
        </TextComponent>
      )}

      <div className="flex flex-col gap-4">
        {filteredGrants.map((grant, index) => (
          <Box
            key={`${grant.capletId}-${grant.capabilityName}-${index}`}
            className="p-4 border border-muted rounded bg-section"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <TextComponent
                  variant={TextVariant.BodyMd}
                  color={TextColor.TextDefault}
                  className="font-semibold"
                >
                  {grant.capabilityName}
                </TextComponent>
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextMuted}
                >
                  Caplet: {grant.capletId}
                </TextComponent>
                <TextComponent
                  variant={TextVariant.BodySm}
                  color={TextColor.TextMuted}
                >
                  Target: {grant.target}
                </TextComponent>
                {grant.restrictions?.expiresAt && (
                  <TextComponent
                    variant={TextVariant.BodySm}
                    color={TextColor.TextMuted}
                  >
                    Expires:{' '}
                    {new Date(grant.restrictions.expiresAt).toLocaleString()}
                  </TextComponent>
                )}
              </div>
              <Button
                variant={ButtonVariant.Secondary}
                size={ButtonSize.Sm}
                onClick={async () =>
                  handleRevoke(grant.capletId, grant.capabilityName)
                }
              >
                Revoke
              </Button>
            </div>
          </Box>
        ))}
      </div>
    </Box>
  );
};
