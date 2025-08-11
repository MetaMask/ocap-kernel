import {
  Box,
  Button,
  ButtonBase,
  FontWeight,
  TextColor,
  Text as TextComponent,
  TextVariant,
} from '@metamask/design-system-react';
import { stringify } from '@metamask/kernel-utils';
import { useMemo, useState } from 'react';

import type { VatRecord } from '../types.ts';
import { Accordion } from './shared/Accordion.tsx';
import { Modal } from './shared/Modal.tsx';
import { VatTable } from './VatTable.tsx';

export const SubclusterAccordion: React.FC<{
  id: string;
  vats: VatRecord[];
  config: unknown;
  onPingVat: (id: string) => void;
  onRestartVat: (id: string) => void;
  onTerminateVat: (id: string) => void;
  onTerminateSubcluster: (id: string) => void;
  onReloadSubcluster: (id: string) => void;
}> = ({
  id,
  vats,
  config,
  onPingVat,
  onRestartVat,
  onTerminateVat,
  onTerminateSubcluster,
  onReloadSubcluster,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const formattedConfig = useMemo(() => stringify(config, 2), [config]);

  return (
    <>
      <Accordion
        title={
          <>
            <TextComponent
              variant={TextVariant.BodySm}
              fontWeight={FontWeight.Medium}
              color={TextColor.TextDefault}
            >
              Subcluster {id} -{' '}
            </TextComponent>
            <TextComponent
              variant={TextVariant.BodySm}
              color={TextColor.TextMuted}
              fontWeight={FontWeight.Regular}
              className="ml-1"
            >
              {vats.length} Vat{vats.length === 1 ? '' : 's'}
            </TextComponent>
          </>
        }
        isExpanded={isExpanded}
        onToggle={setIsExpanded}
        testId={`subcluster-accordion-${id}`}
      >
        <Box className="flex gap-2 px-3">
          <Button
            className="h-auto flex-row justify-center rounded-md"
            onClick={() => onReloadSubcluster(id)}
            data-testid="reload-subcluster-button"
          >
            <TextComponent
              variant={TextVariant.BodySm}
              color={TextColor.PrimaryInverse}
            >
              Reload
            </TextComponent>
          </Button>

          <ButtonBase
            className="h-auto flex-row justify-center rounded-md bg-error-default py-1 hover:bg-error-default-pressed active:bg-error-default-pressed"
            onClick={() => onTerminateSubcluster(id)}
            data-testid="terminate-subcluster-button"
          >
            <TextComponent
              variant={TextVariant.BodySm}
              color={TextColor.ErrorInverse}
            >
              Terminate
            </TextComponent>
          </ButtonBase>

          <ButtonBase
            className="h-auto flex-row justify-center rounded-md bg-muted py-1 hover:bg-muted-hover active:bg-muted-pressed"
            onClick={() => setIsConfigModalOpen(true)}
            data-testid="view-config-button"
          >
            <TextComponent
              variant={TextVariant.BodySm}
              color={TextColor.TextDefault}
            >
              View Config
            </TextComponent>
          </ButtonBase>
        </Box>
        <VatTable
          vats={vats}
          onPingVat={onPingVat}
          onRestartVat={onRestartVat}
          onTerminateVat={onTerminateVat}
        />
      </Accordion>

      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title={`Subcluster ${id} Configuration`}
        size="md"
      >
        <Box className="flex flex-col gap-4">
          <textarea
            className="font-mono text-sm border border-border-default rounded-md p-4 bg-background-alternative text-text-default resize-none w-full min-h-[350px] leading-relaxed whitespace-pre overflow-auto"
            value={formattedConfig}
            readOnly
            rows={20}
            data-testid="config-textarea"
          />
        </Box>
      </Modal>
    </>
  );
};
