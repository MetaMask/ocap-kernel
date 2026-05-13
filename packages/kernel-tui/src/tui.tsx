import { Box, useApp, useInput } from 'ink';
import React, { useCallback, useState } from 'react';

import { FileBrowser } from './components/file-browser.tsx';
import { InvokeView } from './components/invoke-view.tsx';
import { LogView } from './components/log-view.tsx';
import { ObjectRegistryView } from './components/object-registry-view.tsx';
import { SessionsView } from './components/sessions-view.tsx';
import { StatusBar } from './components/status-bar.tsx';
import { useKernel } from './hooks/use-kernel.ts';
import { useTerminalSize } from './hooks/use-terminal-size.ts';
import type { KernelApi, ViewMode } from './types.ts';

const VIEWS: ViewMode[] = ['sessions', 'files', 'objects', 'invoke', 'log'];

type TuiProps = {
  cwd: string;
  kernelApi: KernelApi;
};

/**
 * Root TUI application component.
 *
 * @param props - Component props.
 * @param props.cwd - Current working directory for file browsing.
 * @param props.kernelApi - Kernel API abstraction.
 * @returns The Tui component.
 */
export function Tui({ cwd, kernelApi }: TuiProps): React.ReactElement {
  const { exit } = useApp();
  const { rows } = useTerminalSize();
  const { status, refreshStatus } = useKernel(kernelApi);
  const [currentView, setCurrentView] = useState<ViewMode>('sessions');
  const [logMessages, setLogMessages] = useState<string[]>([]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  useInput((input, key) => {
    if (input === 'q' && !key.ctrl) {
      exit();
    }
    if (key.tab && !key.shift) {
      setCurrentView((prev) => {
        const idx = VIEWS.indexOf(prev);
        return VIEWS[(idx + 1) % VIEWS.length] as ViewMode;
      });
    }
    if (key.tab && key.shift) {
      setCurrentView((prev) => {
        const idx = VIEWS.indexOf(prev);
        return VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length] as ViewMode;
      });
    }
    if (input === 'r' && currentView === 'objects') {
      refreshStatus();
    }
  });

  return (
    <Box flexDirection="column" width="100%" height={rows}>
      <StatusBar status={status} currentView={currentView} />

      <Box flexGrow={1} minHeight={10} overflow="hidden">
        {currentView === 'sessions' && <SessionsView kernelApi={kernelApi} />}
        {currentView === 'files' && (
          <FileBrowser cwd={cwd} kernelApi={kernelApi} onLog={addLog} />
        )}
        {currentView === 'objects' && (
          <ObjectRegistryView kernelApi={kernelApi} />
        )}
        {currentView === 'invoke' && (
          <InvokeView kernelApi={kernelApi} onLog={addLog} />
        )}
        {currentView === 'log' && <LogView messages={logMessages} />}
      </Box>

      <LogView messages={logMessages} maxLines={4} />
    </Box>
  );
}
