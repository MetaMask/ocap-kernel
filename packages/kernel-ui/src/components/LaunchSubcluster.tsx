import type { ClusterConfig } from '@metamask/ocap-kernel';
import { useCallback, useState } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
import { useKernelActions } from '../hooks/useKernelActions.ts';

/**
 * @returns A panel for launching a subcluster.
 */
export const LaunchSubcluster: React.FC = () => {
  const { launchSubcluster } = useKernelActions();
  const { logMessage } = usePanelContext();
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          try {
            const content = loadEvent.target?.result;
            if (typeof content === 'string') {
              const parsedConfig: ClusterConfig = JSON.parse(content);
              launchSubcluster(parsedConfig);
            } else {
              logMessage('Failed to read file content.', 'error');
            }
          } catch (error) {
            logMessage(
              `Error parsing cluster configuration: ${String(error)}`,
              'error',
            );
          }
        };
        reader.onerror = () => {
          logMessage('Failed to read file.', 'error');
        };
        reader.readAsText(file);
      } else {
        setFileName('');
      }
    },
    [launchSubcluster, logMessage],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(true);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
    },
    [],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file && file.type === 'application/json') {
        const input = document.getElementById(
          'subcluster-config-input',
        ) as HTMLInputElement;
        if (input) {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        logMessage('Please drop a valid JSON file.', 'error');
      }
    },
    [logMessage],
  );

  return (
    <div className="newVatWrapper">
      <h4 className="noMargin">Launch New Subcluster</h4>
      <div
        className={`dropZone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="dropZoneContent">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="uploadIcon"
          >
            <path
              d="M12 16L12 8M12 8L15 11M12 8L9 11"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3 15V16C3 18.2091 4.79086 20 7 20H17C19.2091 20 21 18.2091 21 16V15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="dropZoneText">
            {fileName || 'Drag and drop your cluster config JSON file here'}
          </p>
          <label htmlFor="subcluster-config-input" className="buttonPrimary">
            Browse Files
          </label>
          <input
            id="subcluster-config-input"
            type="file"
            accept=".json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            data-testid="subcluster-config-input"
          />
        </div>
      </div>
    </div>
  );
};
