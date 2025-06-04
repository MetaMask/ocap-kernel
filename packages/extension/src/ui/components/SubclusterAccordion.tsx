import { stringify } from '@metamask/kernel-utils';
import { useMemo, useState } from 'react';

import styles from '../App.module.css';
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
            <span className={styles.vatDetailsHeader}>
              {vats.length} Vat{vats.length === 1 ? '' : 's'}
            </span>
          </>
        }
        isExpanded={isExpanded}
        onToggle={setIsExpanded}
        testId={`subcluster-accordion-${id}`}
      >
        <div className={styles.headerControls}>
          <h4>Subcluster Vats</h4>
          <button
            className={styles.buttonGray}
            onClick={() => setIsConfigModalOpen(true)}
          >
            View Config
          </button>
          <button
            className={styles.buttonDanger}
            onClick={() => onTerminateSubcluster(id)}
          >
            Terminate Subcluster
          </button>
          <button
            className={styles.buttonBlack}
            onClick={() => onReloadSubcluster(id)}
          >
            Reload Subcluster
          </button>
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
        <div className={styles.configModalContent}>
          <textarea
            className={styles.configTextarea}
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
