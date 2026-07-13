import type {
  ParsedInvocation,
  Provision,
} from '@metamask/kernel-utils/session';
import {
  argInterval,
  argPatternDisplay,
  invocationToProvision,
} from '@metamask/kernel-utils/session';
import { Box, Text, useInput } from 'ink';
import React, { useMemo, useState } from 'react';

import type { FlatArg } from './provisions.ts';
import { buildProvisions } from './provisions.ts';

type ProvisionEditorProps = {
  toolName: string;
  invocations: ParsedInvocation[];
  clauses?: ParsedInvocation[][];
  onSubmit: (provisions: Provision[]) => void;
  onCancel: () => void;
};

/**
 * Interactive editor that lets the user tune each arg in a pending invocation
 * to a wider pattern (prefix or wildcard) before granting a standing provision.
 *
 * Keybinds: ←/→ navigate args, ↑ widen, ↓ narrow, Enter submit, Esc cancel.
 *
 * @param props - Component props.
 * @param props.toolName - The tool name (e.g. "Bash").
 * @param props.invocations - The parsed invocations for the pending request (single-clause fallback).
 * @param props.clauses - Multi-clause breakdown — one Pipeline per &&/||/; operand.
 * @param props.onSubmit - Called with the resulting Provisions when Enter is pressed.
 * @param props.onCancel - Called when Esc is pressed.
 * @returns The ProvisionEditor component.
 */
export function ProvisionEditor({
  toolName,
  invocations,
  clauses,
  onSubmit,
  onCancel,
}: ProvisionEditorProps): React.ReactElement {
  // Use clauses if provided, otherwise treat invocations as a single clause
  const effectiveClauses = useMemo(
    () => clauses ?? [invocations],
    [clauses, invocations],
  );

  const flatArgs = useMemo<FlatArg[]>(() => {
    const result: FlatArg[] = [];
    for (const clause of effectiveClauses) {
      for (let ii = 0; ii < clause.length; ii++) {
        const inv = clause[ii];
        if (inv === undefined) {
          continue;
        }
        for (let jj = 0; jj < inv.argv.length; jj++) {
          const value = inv.argv[jj];
          if (value !== undefined) {
            result.push({
              invIdx: ii,
              argIdx: jj,
              value,
              interval: argInterval(value),
            });
          }
        }
      }
    }
    return result;
  }, [effectiveClauses]);

  const [cursor, setCursor] = useState(0);
  const [sels, setSels] = useState<number[]>(() => flatArgs.map(() => 0));

  const currentFlatArg = flatArgs[cursor];
  const currentSel = sels[cursor] ?? 0;
  const currentPattern = currentFlatArg?.interval[currentSel];

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    } else if (key.return) {
      const provisions =
        flatArgs.length === 0
          ? effectiveClauses.map((clause) =>
              invocationToProvision(toolName, clause),
            )
          : buildProvisions({
              toolName,
              clauses: effectiveClauses,
              flatArgs,
              sels,
            });
      onSubmit(provisions);
    } else if (key.rightArrow) {
      setCursor((idx) => Math.min(flatArgs.length - 1, idx + 1));
    } else if (key.leftArrow) {
      setCursor((idx) => Math.max(0, idx - 1));
    } else if (key.upArrow && currentFlatArg !== undefined) {
      setSels((prev) => {
        const next = [...prev];
        next[cursor] = Math.min(
          currentFlatArg.interval.length - 1,
          (next[cursor] ?? 0) + 1,
        );
        return next;
      });
    } else if (key.downArrow) {
      setSels((prev) => {
        const next = [...prev];
        next[cursor] = Math.max(0, (next[cursor] ?? 0) - 1);
        return next;
      });
    }
  });

  // Render clauses with && separators; each clause shows its pipeline with | separators.
  // Cursor arg is highlighted; widened args appear in a different color.
  let flatIdx = 0;
  const clauseLines = effectiveClauses.map((clause, clauseIdx) => {
    const pipelineNodes = clause.map((inv, invIdx) => {
      const argNodes = inv.argv.map((val, argIdx) => {
        const fi = flatIdx;
        flatIdx += 1;
        const sel = sels[fi] ?? 0;
        const interval = flatArgs[fi]?.interval ?? argInterval(val);
        const pat = interval[sel];
        const display = pat === undefined ? val : argPatternDisplay(pat);
        const isCursor = fi === cursor;
        const isWidened = sel > 0;
        let argColor: 'cyan' | 'yellow' | undefined;
        if (isCursor) {
          argColor = 'cyan';
        } else if (isWidened) {
          argColor = 'yellow';
        }
        return (
          <Text
            key={`${clauseIdx}-${invIdx}-${argIdx}`}
            {...(argColor === undefined ? {} : { color: argColor })}
            bold={isCursor}
          >
            {' '}
            {display}
          </Text>
        );
      });
      return (
        <React.Fragment key={`${clauseIdx}-${invIdx}`}>
          {invIdx > 0 && <Text dimColor> |</Text>}
          <Text bold>{inv.name}</Text>
          {argNodes}
        </React.Fragment>
      );
    });
    return (
      <Box key={clauseIdx} gap={1} flexWrap="wrap">
        {clauseIdx > 0 && <Text dimColor>&amp;&amp;</Text>}
        {pipelineNodes}
      </Box>
    );
  });

  return (
    <Box flexDirection="column" paddingLeft={4} marginTop={1}>
      {clauseLines}
      {currentFlatArg !== undefined && currentPattern !== undefined && (
        <Box paddingLeft={2} gap={1} marginTop={0}>
          <Text dimColor>↕</Text>
          <Text color="cyan">{argPatternDisplay(currentPattern)}</Text>
          <Text dimColor>
            ({currentFlatArg.interval.indexOf(currentPattern) + 1}/
            {currentFlatArg.interval.length})
          </Text>
        </Box>
      )}
      {flatArgs.length === 0 && (
        <Text dimColor>
          {' '}
          (no args — will match any invocation of {toolName})
        </Text>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          ←/→ navigate · ↑ widen · ↓ narrow · Enter grant · Esc cancel
        </Text>
      </Box>
    </Box>
  );
}
