import type { Subcluster } from '@metamask/ocap-kernel';
import { useMemo, useState } from 'react';

import styles from '../App.module.css';
import { usePanelContext } from '../context/PanelContext.tsx';
import { useKernelActions } from '../hooks/useKernelActions.ts';
import { isValidBundleUrl } from '../utils.ts';

/**
 * @returns A panel for launching a vat.
 */
export const LaunchVat: React.FC = () => {
  const { launchVat } = useKernelActions();
  const { status } = usePanelContext();
  const [bundleUrl, setBundleUrl] = useState<string>(
    'http://localhost:3000/sample-vat.bundle',
  );
  const [newVatName, setNewVatName] = useState<string>('');
  const [selectedSubcluster, setSelectedSubcluster] = useState<string>('');

  const isDisabled = useMemo(
    () => !newVatName.trim() || !isValidBundleUrl(bundleUrl),
    [newVatName, bundleUrl],
  );

  const subclusters = useMemo(() => {
    return status?.subclusters ?? [];
  }, [status?.subclusters]);

  return (
    <div className={styles.newVatWrapper}>
      <h4 className={styles.noMargin}>Add New Vat</h4>
      <div className={styles.newVatForm}>
        <input
          className={styles.vatNameInput}
          type="text"
          value={newVatName}
          onChange={(event) => setNewVatName(event.target.value)}
          placeholder="Vat Name"
        />
        <input
          className={styles.bundleUrlInput}
          type="url"
          value={bundleUrl}
          onChange={(event) => setBundleUrl(event.target.value)}
          placeholder="Bundle URL"
        />
        <select
          className={styles.select}
          value={selectedSubcluster}
          onChange={(event) => setSelectedSubcluster(event.target.value)}
        >
          <option value="">No Subcluster</option>
          {subclusters.map((subcluster: Subcluster) => (
            <option key={subcluster.id} value={subcluster.id}>
              {subcluster.id}
            </option>
          ))}
        </select>
        <button
          className={styles.buttonPrimary}
          onClick={() =>
            launchVat(bundleUrl, newVatName, selectedSubcluster || undefined)
          }
          disabled={isDisabled}
        >
          Launch Vat
        </button>
      </div>
    </div>
  );
};
