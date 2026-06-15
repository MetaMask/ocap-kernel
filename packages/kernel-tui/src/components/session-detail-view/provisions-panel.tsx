import type { Provision } from '@metamask/kernel-utils/session';
import { Box, Text, useInput } from 'ink';
import React, { useMemo, useState } from 'react';

import { formatProvisionCompact } from './format.ts';
import { provisionKey } from './provisions.ts';
import { RevokeConfirm } from './revoke-confirm.tsx';

type ProvisionsPanelProps = {
  provisions: Provision[];
  onClose: () => void;
  onRevoke: (provision: Provision) => Promise<void>;
};

/**
 * Panel listing the active standing provisions for a session.
 *
 * Arrow keys move a cursor between provisions; pressing `3` opens an
 * arrow-keys+enter revoke confirmation. Esc closes the panel (or cancels the
 * confirmation if one is open).
 *
 * @param props - Component props.
 * @param props.provisions - The list of active provisions.
 * @param props.onClose - Callback to close the panel.
 * @param props.onRevoke - Async callback invoked with the chosen provision when the user confirms a revoke.
 * @returns The ProvisionsPanel component.
 */
export function ProvisionsPanel({
  provisions,
  onClose,
  onRevoke,
}: ProvisionsPanelProps): React.ReactElement {
  const [cursor, setCursor] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Session history (the input to deriveActiveProvisions) doesn't track
  // revocations, so we hide revoked entries client-side until the panel closes.
  const [revoked, setRevoked] = useState<Set<string>>(() => new Set());

  const visible = useMemo(
    () => provisions.filter((prov) => !revoked.has(provisionKey(prov))),
    [provisions, revoked],
  );

  const safeCursor = Math.max(0, Math.min(cursor, visible.length - 1));

  useInput((input, key) => {
    if (working || confirming) {
      return;
    }
    if (key.escape) {
      onClose();
      return;
    }
    if (visible.length === 0) {
      return;
    }
    if (key.upArrow) {
      setCursor((idx) => Math.max(0, idx - 1));
    } else if (key.downArrow) {
      setCursor((idx) => Math.min(visible.length - 1, idx + 1));
    } else if (input === '3') {
      setConfirming(true);
      setError(null);
    }
  });

  const handleYes = (): void => {
    const target = visible[safeCursor];
    if (target === undefined) {
      setConfirming(false);
      return;
    }
    setConfirming(false);
    setWorking(true);
    onRevoke(target)
      .then(() => {
        setRevoked((prev) => {
          const next = new Set(prev);
          next.add(provisionKey(target));
          return next;
        });
        return undefined;
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setWorking(false));
  };

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box gap={1} marginBottom={0}>
        <Text bold color="cyan">
          Active provisions
        </Text>
        <Text dimColor>— ↑/↓ navigate · 3 revoke · Esc close</Text>
      </Box>
      {error !== null && <Text color="red">{error}</Text>}
      {visible.length === 0 ? (
        <Text dimColor> No standing provisions yet.</Text>
      ) : (
        visible.map((prov, idx) => {
          const isFocused = idx === safeCursor;
          return (
            <React.Fragment key={provisionKey(prov)}>
              <Box gap={1}>
                <Text>{isFocused ? '►' : ' '}</Text>
                <Text dimColor>◆</Text>
                <Text color="yellow" bold={isFocused}>
                  {prov.tool}
                </Text>
                <Text bold={isFocused}>{formatProvisionCompact(prov)}</Text>
              </Box>
              {isFocused && confirming && (
                <RevokeConfirm
                  onYes={handleYes}
                  onNo={() => setConfirming(false)}
                />
              )}
            </React.Fragment>
          );
        })
      )}
      {working && <Text color="yellow"> revoking…</Text>}
    </Box>
  );
}
