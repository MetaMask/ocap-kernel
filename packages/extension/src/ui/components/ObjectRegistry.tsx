import { useState, useEffect, useCallback } from 'react';

import styles from '../App.module.css';
import { useDatabase } from '../hooks/useDatabase.ts';
import type { ClusterSnapshot, VatSnapshot } from '../services/db-parser.ts';
import { parseKernelDB } from '../services/db-parser.ts';

const VatDetailsHeader: React.FC<{ data: VatSnapshot }> = ({ data }) => {
  const objects = data.ownedObjects.length + data.importedObjects.length;
  const promises = data.importedPromises.length + data.exportedPromises.length;
  return (
    <span className={styles.vatDetailsHeader}>
      {objects} object{objects === 1 ? '' : 's'}, {promises} promise
      {promises === 1 ? '' : 's'}
    </span>
  );
};

export const ObjectRegistry: React.FC = () => {
  const [clusterData, setClusterData] = useState<ClusterSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVats, setExpandedVats] = useState<Record<string, boolean>>({});
  const { executeQuery } = useDatabase();

  // Fetch the kernel data
  const fetchKernelData = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      const result = await executeQuery('SELECT key, value FROM kv');
      const parsedData = parseKernelDB(
        result as { key: string; value: string }[],
      );
      setClusterData(parsedData);
    } catch (fetchError: unknown) {
      setError(
        fetchError instanceof Error ? fetchError.message : String(fetchError),
      );
    } finally {
      setIsLoading(false);
    }
  }, [executeQuery]);

  // On mount, fetch the kernel data
  useEffect(() => {
    fetchKernelData().catch(() => {
      // already handled
    });
  }, [fetchKernelData]);

  const toggleVat = (vatId: string): void => {
    setExpandedVats((prev) => ({
      ...prev,
      [vatId]: !prev[vatId],
    }));
  };

  if (isLoading) {
    return <div className={styles.container}>Loading cluster data...</div>;
  }

  if (error || !clusterData) {
    return (
      <div className={styles.container}>
        <p className={styles.error}>
          Error: {error ?? 'No cluster data available'}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <h2 className={styles.noMargin}>Kernel Registry</h2>
        <button
          className={styles.button}
          onClick={() => {
            fetchKernelData().catch(() => {
              // already handled
            });
          }}
        >
          Refresh
        </button>
      </div>

      <table className={`${styles.noBorder} ${styles.table}`}>
        <tbody>
          <tr>
            <td width="160">GC Actions</td>
            <td>{clusterData.gcActions ?? 'None'}</td>
          </tr>
          <tr>
            <td width="160">Reap Queue</td>
            <td>{clusterData.reapQueue ?? 'Empty'}</td>
          </tr>
          <tr>
            <td width="160">Terminated Vats</td>
            <td>{clusterData.terminatedVats ?? 'None'}</td>
          </tr>
        </tbody>
      </table>

      <h3>Vats</h3>

      {Object.entries(clusterData.vats).map(([vatId, vatData]) => (
        <div key={vatId} className={styles.accordion}>
          <div
            className={styles.accordionHeader}
            onClick={() => toggleVat(vatId)}
          >
            <div className={styles.accordionTitle}>
              {vatData.overview.name} ({vatId}) -{' '}
              <VatDetailsHeader data={vatData} />
            </div>
            <div className={styles.accordionIndicator}>
              {expandedVats[vatId] ? '−' : '+'}
            </div>
          </div>

          {expandedVats[vatId] && (
            <div className={styles.accordionContent}>
              {vatData.ownedObjects.length > 0 && (
                <div className={styles.tableContainer}>
                  <h4>Owned Objects</h4>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>KRef</th>
                        <th>ERef</th>
                        <th>Ref Count</th>
                        <th>To Vat(s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatData.ownedObjects.map((obj, idx) => (
                        <tr key={`owned-${obj.kref}-${idx}`}>
                          <td>{obj.kref}</td>
                          <td>{obj.eref}</td>
                          <td>{obj.refCount}</td>
                          <td>
                            {obj.toVats.length > 0
                              ? obj.toVats.join(', ')
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {vatData.importedObjects.length > 0 && (
                <div className={styles.tableContainer}>
                  <h4>Imported Objects</h4>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>KRef</th>
                        <th>ERef</th>
                        <th>Ref Count</th>
                        <th>From Vat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatData.importedObjects.map((obj, idx) => (
                        <tr key={`imported-${obj.kref}-${idx}`}>
                          <td>{obj.kref}</td>
                          <td>{obj.eref}</td>
                          <td>{obj.refCount}</td>
                          <td>{obj.fromVat ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {vatData.importedPromises.length > 0 && (
                <div className={styles.tableContainer}>
                  <h4>Imported Promises</h4>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>KRef</th>
                        <th>ERef</th>
                        <th>State</th>
                        <th>Value</th>
                        <th>Slots</th>
                        <th>From Vat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatData.importedPromises.map((promise, idx) => (
                        <tr key={`imported-promise-${promise.kref}-${idx}`}>
                          <td>{promise.kref}</td>
                          <td>{promise.eref}</td>
                          <td>{promise.state}</td>
                          <td>{promise.value.body}</td>
                          <td>
                            {promise.value.slots.length > 0
                              ? promise.value.slots
                                  .map(
                                    (slot) =>
                                      `${slot.kref}${slot.eref ? ` (${slot.eref})` : ''}`,
                                  )
                                  .join(', ')
                              : '—'}
                          </td>
                          <td>{promise.fromVat ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {vatData.exportedPromises.length > 0 && (
                <div className={styles.tableContainer}>
                  <h4>Exported Promises</h4>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>KRef</th>
                        <th>ERef</th>
                        <th>State</th>
                        <th>Value</th>
                        <th>Slots</th>
                        <th>To Vat(s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatData.exportedPromises.map((promise, idx) => (
                        <tr key={`exported-promise-${promise.kref}-${idx}`}>
                          <td>{promise.kref}</td>
                          <td>{promise.eref}</td>
                          <td>{promise.state}</td>
                          <td>{promise.value.body}</td>
                          <td>
                            {promise.value.slots.length > 0
                              ? promise.value.slots
                                  .map(
                                    (slot) =>
                                      `${slot.kref}${slot.eref ? ` (${slot.eref})` : ''}`,
                                  )
                                  .join(', ')
                              : '—'}
                          </td>
                          <td>
                            {promise.toVats.length > 0
                              ? promise.toVats.join(', ')
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
