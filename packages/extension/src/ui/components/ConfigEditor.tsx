import type { ClusterConfig } from '@ocap/kernel';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { KernelStatus } from '../../kernel-integration/messages.js';
import styles from '../App.module.css';
import { usePanelContext } from '../context/PanelContext.js';
import { useKernelActions } from '../hooks/useKernelActions.js';

/**
 * Component for editing the kernel cluster configuration.
 *
 * @param options - The component options
 * @param options.status - The kernel status
 * @returns A React component for editing the kernel cluster configuration.
 */
export const ConfigEditorInner: React.FC<{ status: KernelStatus }> = ({
  status,
}) => {
  const { updateClusterConfig, reload } = useKernelActions();
  const { logMessage } = usePanelContext();
  const clusterConfig = useMemo(
    () => JSON.stringify(status.clusterConfig, null, 2),
    [status],
  );
  const [config, setConfig] = useState<string>(clusterConfig);

  // Update the config when the status changes
  useEffect(() => {
    setConfig(clusterConfig);
  }, [clusterConfig]);

  const handleUpdate = useCallback(
    (reloadKernel = false) => {
      try {
        const parsedConfig: ClusterConfig = JSON.parse(config);
        updateClusterConfig(parsedConfig)
          .then(() => reloadKernel && reload())
          .catch((error) => {
            logMessage(String(error), 'error');
          });
      } catch (error) {
        logMessage(String(error), 'error');
      }
    },
    [config, updateClusterConfig],
  );

  if (!config) {
    return null;
  }

  return (
    <div className={styles.configEditor}>
      <h4>Cluster Config</h4>
      <textarea
        value={config}
        onChange={(event) => setConfig(event.target.value)}
        rows={10}
        className={styles.configTextarea}
        data-testid="config-textarea"
      />
      <div className={styles.configEditorButtons}>
        <button
          onClick={() => handleUpdate(false)}
          className={styles.buttonPrimary}
          data-testid="update-config"
        >
          Update Config
        </button>
        <button
          onClick={() => handleUpdate(true)}
          className={styles.buttonBlack}
          data-testid="update-and-restart"
        >
          Update and Reload
        </button>
      </div>
    </div>
  );
};

export const ConfigEditor: React.FC = () => {
  const { status } = usePanelContext();

  if (!status) {
    return null;
  }

  return <ConfigEditorInner status={status} />;
};
