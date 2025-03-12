import { useMemo, useState } from 'react';

import styles from '../App.module.css';
import { useKernelActions } from '../hooks/useKernelActions.ts';
import { isValidBundleUrl } from '../utils.ts';

/**
 * @returns A panel for launching a vat.
 */
export const LaunchVat: React.FC = () => {
  const { launchVat } = useKernelActions();
  const [bundleUrl, setBundleUrl] = useState<string>(
    'http://localhost:3000/sample-vat.bundle',
  );
  const [newVatName, setNewVatName] = useState<string>('');
  const isDisabled = useMemo(
    () => !newVatName.trim() || !isValidBundleUrl(bundleUrl),
    [newVatName, bundleUrl],
  );

  return (
    <div className={styles.newVatWrapper}>
      <h4>Add New Vat</h4>
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
        <button
          className={styles.buttonPrimary}
          onClick={() => launchVat(bundleUrl, newVatName)}
          disabled={isDisabled}
        >
          Launch Vat
        </button>
      </div>
    </div>
  );
};
