import { glob } from 'glob';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import React, { useEffect, useState } from 'react';

import type { KernelApi } from '../types.ts';

type FileBrowserProps = {
  cwd: string;
  kernelApi: KernelApi;
  onLog: (message: string) => void;
};

type FileItem = {
  label: string;
  value: string;
};

/**
 * File browser for discovering and launching .bundle and subcluster.json files.
 *
 * @param props - Component props.
 * @param props.cwd - Current working directory to scan.
 * @param props.kernelApi - Kernel API for launching subclusters.
 * @param props.onLog - Callback to add a log message.
 * @returns The FileBrowser component.
 */
export function FileBrowser({
  cwd,
  kernelApi,
  onLog,
}: FileBrowserProps): React.ReactElement {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      glob('**/*.bundle', { cwd, maxDepth: 3 }),
      glob('**/subcluster.json', { cwd, maxDepth: 3 }),
    ])
      .then(([bundleFiles, jsonFiles]) => {
        const items = [...bundleFiles, ...jsonFiles].map((file) => ({
          label: file,
          value: path.resolve(cwd, file),
        }));
        setFiles(items);
        return undefined;
      })
      .catch(() => undefined);
  }, [cwd]);

  const handleSelect = (item: FileItem): void => {
    setLoading(true);
    setResult(null);
    const filePath = item.value;

    (async () => {
      const content = await readFile(filePath, 'utf-8');
      let config: Record<string, unknown>;

      if (filePath.endsWith('.json')) {
        config = JSON.parse(content) as Record<string, unknown>;
      } else {
        config = {
          bootstrap: 'main',
          vats: { main: { bundleSpec: `file://${filePath}` } },
        };
      }

      const launchResult = await kernelApi.launchSubcluster(config);
      const logMessage = `Launched ${item.label} → kref: ${launchResult.bootstrapRootKref}`;
      setResult(logMessage);
      onLog(logMessage);
    })()
      .catch((error: Error) => {
        const logMessage = `Error launching ${item.label}: ${error.message}`;
        setResult(logMessage);
        onLog(logMessage);
      })
      .finally(() => setLoading(false));
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>File Browser</Text>
      <Text dimColor>Select a .bundle or subcluster.json to launch</Text>
      {files.length === 0 ? (
        <Text color="yellow">
          No .bundle or subcluster.json files found in {cwd}
        </Text>
      ) : (
        <SelectInput items={files} onSelect={handleSelect} />
      )}
      {loading && (
        <Text>
          <Spinner type="dots" /> Launching...
        </Text>
      )}
      {result && <Text color="green">{result}</Text>}
    </Box>
  );
}
