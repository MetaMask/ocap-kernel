import {
  Button,
  ButtonBaseSize,
  ButtonVariant,
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
            Subcluster {id} -{' '}
            <span className="vatDetailsHeader">
              {vats.length} Vat{vats.length === 1 ? '' : 's'}
            </span>
          </>
        }
        isExpanded={isExpanded}
        onToggle={setIsExpanded}
        testId={`subcluster-accordion-${id}`}
      >
        <div className="headerControls">
          <h4>Subcluster Vats</h4>
          <Button
            size={ButtonBaseSize.Sm}
            variant={ButtonVariant.Secondary}
            onClick={() => setIsConfigModalOpen(true)}
          >
            View Config
          </Button>
          <Button
            size={ButtonBaseSize.Sm}
            variant={ButtonVariant.Primary}
            onClick={() => onTerminateSubcluster(id)}
            isDanger
          >
            Terminate Subcluster
          </Button>
          <Button
            size={ButtonBaseSize.Sm}
            variant={ButtonVariant.Primary}
            onClick={() => onReloadSubcluster(id)}
          >
            Reload Subcluster
          </Button>
        </div>
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
        <div className="configModalContent">
          <textarea
            className="configTextarea"
            value={formattedConfig}
            readOnly
            rows={20}
            data-testid="config-textarea"
          />
        </div>
      </Modal>
    </>
  );
};
