import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React, { useEffect, useState } from 'react';

import type { KernelApi, RegistryEntry } from '../types.ts';

type ObjectRegistryViewProps = {
  kernelApi: KernelApi;
};

/**
 * Display the kernel object registry grouped by key prefix.
 *
 * @param props - Component props.
 * @param props.kernelApi - Kernel API for querying the registry.
 * @returns The ObjectRegistryView component.
 */
export function ObjectRegistryView({
  kernelApi,
}: ObjectRegistryViewProps): React.ReactElement {
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = (): void => {
    setLoading(true);
    kernelApi
      .getObjectRegistry()
      .then((result) => {
        setEntries(result);
        setLoading(false);
        return undefined;
      })
      .catch((caught: Error) => {
        setError(caught.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return (
      <Box paddingX={1}>
        <Text>
          <Spinner type="dots" /> Loading object registry...
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box paddingX={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  const objects = entries.filter((entry) => entry.key.startsWith('ko'));
  const promises = entries.filter((entry) => entry.key.startsWith('kp'));
  const vatEntries = entries.filter((entry) => /^v\d/u.test(entry.key));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Object Registry</Text>
      <Text dimColor>r: refresh</Text>

      {entries.length === 0 ? (
        <Text color="yellow">No entries in kernel registry</Text>
      ) : (
        <>
          {objects.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="cyan">
                Objects ({objects.length})
              </Text>
              {objects.map((entry) => (
                <Text key={entry.key}>
                  {'  '}
                  {entry.key} = {entry.value}
                </Text>
              ))}
            </Box>
          )}

          {promises.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="cyan">
                Promises ({promises.length})
              </Text>
              {promises.slice(0, 20).map((entry) => (
                <Text key={entry.key}>
                  {'  '}
                  {entry.key} = {entry.value}
                </Text>
              ))}
              {promises.length > 20 && (
                <Text dimColor>
                  {'  '}... and {promises.length - 20} more
                </Text>
              )}
            </Box>
          )}

          {vatEntries.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="cyan">
                Vat Entries ({vatEntries.length})
              </Text>
              {vatEntries.slice(0, 20).map((entry) => (
                <Text key={entry.key}>
                  {'  '}
                  {entry.key} = {entry.value}
                </Text>
              ))}
              {vatEntries.length > 20 && (
                <Text dimColor>
                  {'  '}... and {vatEntries.length - 20} more
                </Text>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
