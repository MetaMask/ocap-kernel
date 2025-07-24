import {
  Icon,
  IconName,
  Text as TextComponent,
  TextVariant,
  Box,
  FontWeight,
  TextColor,
} from '@metamask/design-system-react';
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
    <Box className="mt-6">
      <div
        className={`border-2 border-dashed border-muted rounded-md p-8 bg-section transition-all duration-200 ease-in-out cursor-pointer select-none ${
          isDragging ? 'border-primary-default bg-primary-muted' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <Icon name={IconName.Upload} className="text-text-muted" />
          <Box>
            <TextComponent
              variant={TextVariant.BodySm}
              fontWeight={FontWeight.Medium}
              color={TextColor.TextAlternative}
            >
              Launch New Subcluster
            </TextComponent>
            <p className="text-text-muted text-sm m-0">
              {fileName || 'Drag and drop your cluster config JSON file here'}
            </p>
          </Box>
          <label
            htmlFor="subcluster-config-input"
            className="rounded-md bg-muted py-1 px-2 hover:bg-primary-default-pressed active:bg-primary-default-pressed cursor-pointer"
          >
            <TextComponent
              variant={TextVariant.BodyXs}
              color={TextColor.PrimaryInverse}
            >
              Browse Files
            </TextComponent>
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
    </Box>
  );
};
