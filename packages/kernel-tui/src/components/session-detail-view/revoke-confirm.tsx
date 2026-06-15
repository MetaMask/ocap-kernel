import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

type RevokeConfirmProps = {
  onYes: () => void;
  onNo: () => void;
};

/**
 * Arrow-keys-and-enter confirmation prompt rendered inline below the focused
 * provision when the user presses `3` to begin revoking it. Esc cancels.
 *
 * @param props - Component props.
 * @param props.onYes - Selected when the user confirms.
 * @param props.onNo - Selected when the user declines or escapes.
 * @returns The RevokeConfirm component.
 */
export function RevokeConfirm({
  onYes,
  onNo,
}: RevokeConfirmProps): React.ReactElement {
  const [choice, setChoice] = useState<'yes' | 'no'>('no');
  useInput((_input, key) => {
    if (key.escape) {
      onNo();
    } else if (key.upArrow || key.downArrow) {
      setChoice((prev) => (prev === 'yes' ? 'no' : 'yes'));
    } else if (key.return) {
      if (choice === 'yes') {
        onYes();
      } else {
        onNo();
      }
    }
  });
  return (
    <Box flexDirection="column" paddingLeft={4}>
      <Text>revoke?</Text>
      <Text
        {...(choice === 'yes' ? { color: 'cyan' } : {})}
        bold={choice === 'yes'}
      >
        {choice === 'yes' ? '►' : ' '} 1. yes
      </Text>
      <Text
        {...(choice === 'no' ? { color: 'cyan' } : {})}
        bold={choice === 'no'}
      >
        {choice === 'no' ? '►' : ' '} 2. no
      </Text>
    </Box>
  );
}
