import defaultConfig from '@metamask/kernel-browser-runtime/default-cluster';
import { stringify } from '@metamask/kernel-utils';
import type { ClusterConfig, KernelStatus } from '@metamask/ocap-kernel';
import { useCallback, useEffect, useMemo, useState } from 'react';

import minimalConfig from '../../vats/minimal-cluster.json';
import styles from '../App.module.css';
import { usePanelContext } from '../context/PanelContext.tsx';
import { useKernelActions } from '../hooks/useKernelActions.ts';

type ConfigEntry = {
  name: string;
  config: ClusterConfig;
};

const availableConfigs: ConfigEntry[] = [
  { name: 'Default', config: defaultConfig },
  { name: 'Minimal', config: minimalConfig },
];

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
    () => stringify(status.clusterConfig),
    [status],
  );
  const [config, setConfig] = useState<string>(clusterConfig);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // Update the config when the status changes
  useEffect(() => {
    setConfig(clusterConfig);
    setSelectedTemplate(
      availableConfigs.find((item) => stringify(item.config) === clusterConfig)
        ?.name ?? '',
    );
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
    [config, updateClusterConfig, reload, logMessage],
  );

  const handleSelectConfig = useCallback((configName: string) => {
    const selectedConfig = availableConfigs.find(
      (item) => item.name === configName,
    )?.config;
    if (selectedConfig) {
      setConfig(stringify(selectedConfig));
      setSelectedTemplate(configName);
    }
  }, []);

  const toggleExpanded = (): void => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className={styles.accordion}>
      <div
        className={styles.accordionHeader}
        data-testid="config-title"
        onClick={toggleExpanded}
      >
        <div className={styles.accordionTitle}>Cluster Config</div>
        <div className={styles.accordionIndicator}>
          {isExpanded ? '−' : '+'}
        </div>
      </div>

      {isExpanded && (
        <div className={styles.accordionContent}>
          <textarea
            value={config}
            onChange={(event) => setConfig(event.target.value)}
            rows={10}
            className={styles.configTextarea}
            data-testid="config-textarea"
          />
          <div className={styles.configControls}>
            <select
              className={styles.select}
              onChange={(event) => handleSelectConfig(event.target.value)}
              value={selectedTemplate}
              data-testid="config-select"
            >
              <option value="" disabled>
                Select template...
              </option>
              {availableConfigs.map(({ name }) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
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
        </div>
      )}
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
