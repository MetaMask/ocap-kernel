import type {
  ArgPattern,
  ParsedInvocation,
  Provision,
} from '@metamask/kernel-utils/session';
import { argInterval } from '@metamask/kernel-utils/session';

import type { SessionHistoryEntry } from '../../types.ts';

export type FlatArg = {
  invIdx: number;
  argIdx: number;
  value: string;
  interval: ArgPattern[];
};

/**
 * Build one Provision per clause from the editor's current selections.
 *
 * @param options - Options bag.
 * @param options.toolName - The tool name.
 * @param options.clauses - The original parsed clauses (each clause is a pipeline of invocations).
 * @param options.flatArgs - Flattened arg list with intervals (across all clauses in order).
 * @param options.sels - Per-flat-arg selection indices into each interval.
 * @returns An array of Provisions — one per clause.
 */
export function buildProvisions(options: {
  toolName: string;
  clauses: ParsedInvocation[][];
  flatArgs: FlatArg[];
  sels: number[];
}): Provision[] {
  const { toolName, clauses, flatArgs, sels } = options;
  let flatIdx = 0;
  return clauses.map((clause) => ({
    tool: toolName,
    patterns: clause.map((inv) => ({
      name: inv.name,
      argPatterns: inv.argv.map((val) => {
        const fi = flatIdx;
        flatIdx += 1;
        const sel = sels[fi] ?? 0;
        const interval = flatArgs[fi]?.interval ?? argInterval(val);
        return interval[sel] ?? ({ kind: 'wildcard' } as const);
      }),
    })),
  }));
}

/**
 * Canonical string key for a Provision, stable across the two pathways that
 * insert into session history. The user's direct accept stores provisions in
 * source-code key order; auto-provisioned entries from caprock's PreToolUse
 * handler round-trip through the kernel's CapData layer and may emerge with a
 * different key order. Plain JSON.stringify treats those as distinct, so
 * deduplication and revoke-tracking would double-list the same provision.
 *
 * @param prov - The provision to key.
 * @returns A canonical string key.
 */
export function provisionKey(prov: Provision): string {
  return JSON.stringify({
    tool: prov.tool,
    patterns: prov.patterns.map((pat) => ({
      name: pat.name,
      argPatterns: pat.argPatterns.map((ap) => {
        if (ap.kind === 'exact') {
          return { kind: 'exact' as const, value: ap.value };
        }
        if (ap.kind === 'prefix') {
          return { kind: 'prefix' as const, prefix: ap.prefix };
        }
        return { kind: 'wildcard' as const };
      }),
    })),
  });
}

/**
 * Derive the list of unique active provisions from the session history.
 * Includes provisions from both user-granted (◆) and auto-accepted (→) entries.
 * Deduplicates by canonical content.
 *
 * @param entries - The full session history.
 * @returns Unique provisions, in the order they first appeared.
 */
export function deriveActiveProvisions(
  entries: SessionHistoryEntry[],
): Provision[] {
  const seen = new Set<string>();
  const result: Provision[] = [];
  for (const entry of entries) {
    for (const prov of entry.provisions ?? []) {
      const key = provisionKey(prov);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(prov);
      }
    }
  }
  return result;
}
