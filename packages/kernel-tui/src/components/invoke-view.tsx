import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import React, { useState } from 'react';

import type { KernelApi } from '../types.ts';

type InvokeViewProps = {
  kernelApi: KernelApi;
  onLog: (message: string) => void;
};

type InputField = 'kref' | 'method' | 'args';

/**
 * View for invoking methods on kernel objects.
 *
 * @param props - Component props.
 * @param props.kernelApi - Kernel API for sending messages.
 * @param props.onLog - Callback to add a log message.
 * @returns The InvokeView component.
 */
export function InvokeView({
  kernelApi,
  onLog,
}: InvokeViewProps): React.ReactElement {
  const [kref, setKref] = useState('');
  const [method, setMethod] = useState('__getMethodNames__');
  const [args, setArgs] = useState('[]');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<InputField>('kref');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (): void => {
    if (!kref || !method) {
      setError('kref and method are required');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    let parsedArgs: unknown[];
    try {
      parsedArgs = JSON.parse(args);
    } catch {
      setError('Invalid JSON for args');
      setLoading(false);
      return;
    }

    kernelApi
      .queueMessage(kref, method, parsedArgs)
      .then((res) => {
        const formatted = JSON.stringify(res, null, 2);
        setResult(formatted);
        onLog(`Invoked ${kref}.${method}(${args})`);
        return undefined;
      })
      .catch((caught: Error) => {
        setError(caught.message);
        onLog(`Error invoking ${kref}.${method}: ${caught.message}`);
      })
      .finally(() => setLoading(false));
  };

  useInput((_input, key) => {
    if (key.tab) {
      setActiveField((prev) => {
        if (prev === 'kref') {
          return 'method';
        }
        if (prev === 'method') {
          return 'args';
        }
        return 'kref';
      });
    }
    if (key.return && activeField === 'args') {
      handleSubmit();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Invoke Method</Text>

      <Box marginTop={1}>
        <Text
          bold
          {...(activeField === 'kref' ? { color: 'cyan' as const } : {})}
        >
          Target (kref):{' '}
        </Text>
        {activeField === 'kref' ? (
          <TextInput value={kref} onChange={setKref} />
        ) : (
          <Text>{kref || '<empty>'}</Text>
        )}
      </Box>

      <Box>
        <Text
          bold
          {...(activeField === 'method' ? { color: 'cyan' as const } : {})}
        >
          Method:{' '}
        </Text>
        {activeField === 'method' ? (
          <TextInput value={method} onChange={setMethod} />
        ) : (
          <Text>{method}</Text>
        )}
      </Box>

      <Box>
        <Text
          bold
          {...(activeField === 'args' ? { color: 'cyan' as const } : {})}
        >
          Args (JSON):{' '}
        </Text>
        {activeField === 'args' ? (
          <TextInput value={args} onChange={setArgs} />
        ) : (
          <Text>{args}</Text>
        )}
      </Box>

      {loading && <Text color="yellow">Sending...</Text>}
      {error && <Text color="red">Error: {error}</Text>}
      {result && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">
            Result:
          </Text>
          <Text>{result}</Text>
        </Box>
      )}
    </Box>
  );
}
