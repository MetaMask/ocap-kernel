import { useState } from 'react';

import styles from '../App.module.css';
import { useVats } from '../hooks/useVats.ts';
import type { VatRecord } from '../types.ts';

const VatTable: React.FC<{
  vats: VatRecord[];
  onPingVat: (id: string) => void;
  onRestartVat: (id: string) => void;
  onTerminateVat: (id: string) => void;
}> = ({ vats, onPingVat, onRestartVat, onTerminateVat }) => {
  if (vats.length === 0) {
    return null;
  }

  return (
    <div className={`${styles.table} ${styles.subclusterTable}`}>
      <table data-testid="vat-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Source</th>
            <th>Parameters</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {vats.map((vat) => (
            <tr key={vat.id} data-vat-id={vat.id}>
              <td>{vat.id}</td>
              <td>{vat.source}</td>
              <td>{vat.parameters}</td>
              <td>
                <div className={styles.tableActions}>
                  <button
                    className={styles.smallButton}
                    onClick={() => onPingVat(vat.id)}
                  >
                    Ping
                  </button>
                  <button
                    className={styles.smallButton}
                    onClick={() => onRestartVat(vat.id)}
                  >
                    Restart
                  </button>
                  <button
                    className={styles.smallButton}
                    onClick={() => onTerminateVat(vat.id)}
                  >
                    Terminate
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const SubclusterAccordion: React.FC<{
  id: string;
  vats: VatRecord[];
  onPingVat: (id: string) => void;
  onRestartVat: (id: string) => void;
  onTerminateVat: (id: string) => void;
  onTerminateSubcluster: (id: string) => void;
  onReloadSubcluster: (id: string) => void;
}> = ({
  id,
  vats,
  onPingVat,
  onRestartVat,
  onTerminateVat,
  onTerminateSubcluster,
  onReloadSubcluster,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={styles.accordion}>
      <div
        className={`accordion-header ${styles.accordionHeader}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={`accordion-title ${styles.accordionTitle}`}>
          Subcluster {id} -{' '}
          <span className={styles.vatDetailsHeader}>
            {vats.length} Vat{vats.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className={styles.accordionIndicator}>
          {isExpanded ? '−' : '+'}
        </div>
      </div>

      {isExpanded && (
        <div className={styles.accordionContent}>
          <div className={styles.headerControls}>
            <h4>Subcluster Vats</h4>
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
        </div>
      )}
    </div>
  );
};

/**
 * @returns A set of accordion-style tables for active vats, grouped by subcluster.
 */
export const SubclustersTable: React.FC = () => {
  const {
    groupedVats,
    pingVat,
    restartVat,
    terminateVat,
    terminateSubcluster,
    reloadSubcluster,
  } = useVats();

  if (!groupedVats || groupedVats.subclusters.length === 0) {
    return (
      <p className={styles.error}>
        No vats or subclusters are currently active.
      </p>
    );
  }

  return (
    <div className={styles.tableContainer}>
      {groupedVats.subclusters.map((subcluster) => (
        <SubclusterAccordion
          key={subcluster.id}
          id={subcluster.id}
          vats={subcluster.vatRecords}
          onPingVat={pingVat}
          onRestartVat={restartVat}
          onTerminateVat={terminateVat}
          onTerminateSubcluster={terminateSubcluster}
          onReloadSubcluster={reloadSubcluster}
        />
      ))}
    </div>
  );
};
