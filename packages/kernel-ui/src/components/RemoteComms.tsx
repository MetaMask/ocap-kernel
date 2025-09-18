import {
  Box,
  Text as TextComponent,
  TextColor,
  TextVariant,
  FontWeight,
  BadgeStatus,
  BadgeStatusStatus,
} from '@metamask/design-system-react';
import { useEffect } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
import { useRegistry } from '../hooks/useRegistry.ts';
import { Input } from './shared/Input.tsx';

/**
 * RemoteComms component displays remote communications information.
 * Shows peer ID, initialization status, and in the future could show
 * active connections, message history, etc.
 *
 * @returns JSX element for remote communications information
 */
export const RemoteComms: React.FC = () => {
  const { status, objectRegistry } = usePanelContext();
  const { fetchObjectRegistry } = useRegistry();

  // Fetch the object registry when component mounts
  useEffect(() => {
    if (!objectRegistry) {
      fetchObjectRegistry();
    }
  }, [fetchObjectRegistry, objectRegistry]);

  // Get exported ocap URLs from the object registry
  const exportedUrls = objectRegistry?.ocapUrls ?? [];

  if (!status) {
    return (
      <Box>
        <TextComponent>Loading remote communications status...</TextComponent>
      </Box>
    );
  }

  const { remoteComms } = status;

  return (
    <Box>
      <Box className="bg-section p-4 rounded mb-4">
        <Box className="flex align-items-start gap-12">
          {/* Status Section */}
          <Box className="flex-0 flex-none">
            <TextComponent
              variant={TextVariant.BodySm}
              fontWeight={FontWeight.Medium}
              className="mb-4"
              data-testid="status-text"
            >
              Status
            </TextComponent>
            <Box className="flex items-center gap-2">
              {/* Not Available Message */}
              {remoteComms ? (
                <>
                  <BadgeStatus
                    status={
                      remoteComms.isInitialized
                        ? BadgeStatusStatus.Active
                        : BadgeStatusStatus.Inactive
                    }
                  />

                  <TextComponent
                    variant={TextVariant.BodySm}
                    color={
                      remoteComms.isInitialized
                        ? TextColor.SuccessDefault
                        : TextColor.ErrorDefault
                    }
                    data-testid="initialization-status"
                  >
                    {remoteComms.isInitialized
                      ? 'Initialized'
                      : 'Not Initialized'}
                  </TextComponent>
                </>
              ) : (
                <TextComponent
                  color={TextColor.WarningDefault}
                  data-testid="warning-message"
                >
                  Remote communications not yet available in kernel status.
                  Please rebuild the kernel to see remote comms information.
                </TextComponent>
              )}
            </Box>
          </Box>

          {/* Peer ID Section */}
          {remoteComms?.peerId && (
            <Box className="flex-1 min-w-0">
              <TextComponent
                variant={TextVariant.BodySm}
                fontWeight={FontWeight.Medium}
                className="mb-2"
                data-testid="peer-id-text"
              >
                Peer Identity
              </TextComponent>
              <Input
                data-testid="peer-id-display"
                value={remoteComms.peerId}
                style={{ width: '100%' }}
                readOnly
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* Exported Ocap URLs Section */}
      {exportedUrls.length > 0 && (
        <>
          <TextComponent
            variant={TextVariant.BodySm}
            fontWeight={FontWeight.Medium}
            className="mb-4"
            data-testid="exported-urls-text"
          >
            Exported Object URLs
          </TextComponent>

          <Box className="space-y-3">
            {exportedUrls.map(({ vatId, promiseId, ocapUrl }) => (
              <Box key={promiseId} className="border border-muted rounded p-3">
                <Box className="flex items-center gap-2 mb-2">
                  <TextComponent
                    variant={TextVariant.BodyXs}
                    fontWeight={FontWeight.Medium}
                  >
                    Vat {vatId}
                  </TextComponent>
                  <TextComponent
                    variant={TextVariant.BodyXs}
                    color={TextColor.TextMuted}
                  >
                    ({promiseId})
                  </TextComponent>
                </Box>

                <Input
                  data-testid={`ocap-url-${promiseId}`}
                  value={ocapUrl}
                  style={{ width: '100%', fontSize: '12px' }}
                  readOnly
                />
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};
