import { Box, Text } from 'ink';
import React from 'react';

type LogViewProps = {
  messages: string[];
  maxLines?: number;
};

/**
 * Scrolling log output display.
 *
 * @param props - Component props.
 * @param props.messages - Log messages to display.
 * @param props.maxLines - Maximum number of lines to show.
 * @returns The LogView component.
 */
export function LogView({
  messages,
  maxLines = 8,
}: LogViewProps): React.ReactElement {
  const visibleMessages = messages.slice(-maxLines);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      paddingX={1}
      height={maxLines + 2}
    >
      <Text bold dimColor>
        Log
      </Text>
      {visibleMessages.length === 0 ? (
        <Text dimColor>No log messages</Text>
      ) : (
        visibleMessages.map((line, idx) => (
          <Text key={idx} dimColor>
            {line}
          </Text>
        ))
      )}
    </Box>
  );
}
