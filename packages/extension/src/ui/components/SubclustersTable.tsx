import styles from '../App.module.css';
import { SubclusterAccordion } from './SubclusterAccordion.tsx';
import { VatTable } from './VatTable.tsx';
import { useVats } from '../hooks/useVats.ts';

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

  if (
    !groupedVats ||
    (groupedVats.subclusters.length === 0 && groupedVats.rogueVats.length === 0)
  ) {
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
          config={subcluster.config}
          onPingVat={pingVat}
          onRestartVat={restartVat}
          onTerminateVat={terminateVat}
          onTerminateSubcluster={terminateSubcluster}
          onReloadSubcluster={reloadSubcluster}
        />
      ))}
      {groupedVats.rogueVats.length > 0 && (
        <div className={styles.tableContainer} data-testid="rogue-vats-table">
          <VatTable
            vats={groupedVats.rogueVats}
            onPingVat={pingVat}
            onRestartVat={restartVat}
            onTerminateVat={terminateVat}
          />
        </div>
      )}
    </div>
  );
};
