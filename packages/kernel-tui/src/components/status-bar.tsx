import { Box, Text } from 'ink';
import React from 'react';

import type { KernelStatus, ViewMode } from '../types.ts';

type StatusBarProps = {
  status: KernelStatus | null;
  currentView: ViewMode;
};

const VIEW_HINTS: Record<ViewMode, string> = {
  sessions:
    '↑/↓: navigate | 1: accept | 2: provision | 3: reject | P: provisions | R: refresh',
  files: 'Select a bundle to launch',
  objects: 'r: refresh',
  invoke: 'Tab: next field | Enter on args: send',
  log: '',
};

/**
 * Status bar displaying kernel state and view-specific navigation hints.
 *
 * @param props - Component props.
 * @param props.status - Current kernel status.
 * @param props.currentView - The currently active view name.
 * @returns The StatusBar component.
 */
export function StatusBar({
  status,
  currentView,
}: StatusBarProps): React.ReactElement {
  const hint = VIEW_HINTS[currentView];
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text>
        <Text bold>Kernel:</Text>{' '}
        {status ? (
          <Text color={status.active ? 'green' : 'red'}>
            {status.active ? 'active' : 'inactive'} | Vats: {status.vatCount} |
            Subclusters: {status.subclusterCount}
          </Text>
        ) : (
          <Text color="yellow">connecting...</Text>
        )}
      </Text>
      <Text dimColor>
        {currentView} | Tab: switch view | q: quit
        {hint ? ` | ${hint}` : ''}
      </Text>
    </Box>
  );
}
