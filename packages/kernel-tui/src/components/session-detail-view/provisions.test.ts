import type {
  ParsedInvocation,
  Provision,
} from '@metamask/kernel-utils/session';
import { argInterval } from '@metamask/kernel-utils/session';
import { describe, expect, it } from 'vitest';

import type { FlatArg } from './provisions.ts';
import {
  buildProvisions,
  deriveActiveProvisions,
  provisionKey,
} from './provisions.ts';
import type { SessionHistoryEntry } from '../../types.ts';

function makeFlatArgs(clauses: ParsedInvocation[][]): FlatArg[] {
  const result: FlatArg[] = [];
  for (const clause of clauses) {
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
}

function makeEntry(
  token: string,
  overrides: Partial<SessionHistoryEntry> = {},
): SessionHistoryEntry {
  return {
    token,
    description: 'd',
    reason: 'r',
    guard: { body: '#{}', slots: [] },
    queuedAt: '2026-01-01T00:00:00.000Z',
    status: 'accepted',
    ...overrides,
  };
}

describe('buildProvisions', () => {
  it('produces one provision per clause with exact argv when sels are all zero', () => {
    const clauses: ParsedInvocation[][] = [
      [{ name: 'ls', argv: ['/tmp'] }],
      [{ name: 'echo', argv: ['done'] }],
    ];
    const flatArgs = makeFlatArgs(clauses);
    const result = buildProvisions({
      toolName: 'Bash',
      clauses,
      flatArgs,
      sels: flatArgs.map(() => 0),
    });
    expect(result).toStrictEqual([
      {
        tool: 'Bash',
        patterns: [
          { name: 'ls', argPatterns: [{ kind: 'exact', value: '/tmp' }] },
        ],
      },
      {
        tool: 'Bash',
        patterns: [
          { name: 'echo', argPatterns: [{ kind: 'exact', value: 'done' }] },
        ],
      },
    ]);
  });

  it('widens an arg when its selection is past the exact entry', () => {
    const clauses: ParsedInvocation[][] = [
      [{ name: 'ls', argv: ['/tmp/foo'] }],
    ];
    const flatArgs = makeFlatArgs(clauses);
    // pathInterval(/tmp/foo) = exact, prefix /tmp/, prefix /, wildcard
    const result = buildProvisions({
      toolName: 'Bash',
      clauses,
      flatArgs,
      sels: [1],
    });
    expect(result).toStrictEqual([
      {
        tool: 'Bash',
        patterns: [
          {
            name: 'ls',
            argPatterns: [{ kind: 'prefix', prefix: '/tmp/' }],
          },
        ],
      },
    ]);
  });

  it('falls back to wildcard when the selection index is out of bounds', () => {
    const clauses: ParsedInvocation[][] = [[{ name: 'ls', argv: ['foo'] }]];
    const flatArgs = makeFlatArgs(clauses);
    // trivialInterval has 2 entries; index 5 is out of range → wildcard fallback.
    const result = buildProvisions({
      toolName: 'Bash',
      clauses,
      flatArgs,
      sels: [5],
    });
    expect(result).toStrictEqual([
      {
        tool: 'Bash',
        patterns: [{ name: 'ls', argPatterns: [{ kind: 'wildcard' }] }],
      },
    ]);
  });

  it('handles a multi-invocation pipeline within a single clause', () => {
    const clauses: ParsedInvocation[][] = [
      [
        { name: 'git', argv: ['log'] },
        { name: 'head', argv: ['-10'] },
      ],
    ];
    const flatArgs = makeFlatArgs(clauses);
    const result = buildProvisions({
      toolName: 'Bash',
      clauses,
      flatArgs,
      sels: flatArgs.map(() => 0),
    });
    expect(result).toStrictEqual([
      {
        tool: 'Bash',
        patterns: [
          { name: 'git', argPatterns: [{ kind: 'exact', value: 'log' }] },
          { name: 'head', argPatterns: [{ kind: 'exact', value: '-10' }] },
        ],
      },
    ]);
  });
});

describe('provisionKey', () => {
  const baseProvision: Provision = {
    tool: 'Bash',
    patterns: [
      {
        name: 'ls',
        argPatterns: [{ kind: 'exact', value: '/tmp' }, { kind: 'wildcard' }],
      },
    ],
  };

  it('produces a deterministic key for a provision', () => {
    expect(provisionKey(baseProvision)).toBe(provisionKey(baseProvision));
  });

  it('produces the same key regardless of arg-pattern field ordering', () => {
    const reordered: Provision = {
      tool: 'Bash',
      patterns: [
        {
          name: 'ls',
          argPatterns: [
            // Same content but properties written in opposite order — should canonicalize.
            { value: '/tmp', kind: 'exact' } as {
              kind: 'exact';
              value: string;
            },
            { kind: 'wildcard' },
          ],
        },
      ],
    };
    expect(provisionKey(reordered)).toBe(provisionKey(baseProvision));
  });

  it('produces different keys for structurally different provisions', () => {
    const other: Provision = {
      tool: 'Read',
      patterns: [
        {
          name: 'Read',
          argPatterns: [{ kind: 'wildcard' }],
        },
      ],
    };
    expect(provisionKey(other)).not.toBe(provisionKey(baseProvision));
  });

  it('normalizes the prefix arg-pattern shape', () => {
    const a: Provision = {
      tool: 'Bash',
      patterns: [
        {
          name: 'ls',
          argPatterns: [{ kind: 'prefix', prefix: '/tmp/' }],
        },
      ],
    };
    const b: Provision = {
      tool: 'Bash',
      patterns: [
        {
          name: 'ls',
          argPatterns: [
            { prefix: '/tmp/', kind: 'prefix' } as {
              kind: 'prefix';
              prefix: string;
            },
          ],
        },
      ],
    };
    expect(provisionKey(a)).toBe(provisionKey(b));
  });
});

describe('deriveActiveProvisions', () => {
  const provA: Provision = {
    tool: 'Bash',
    patterns: [{ name: 'ls', argPatterns: [{ kind: 'wildcard' }] }],
  };
  const provB: Provision = {
    tool: 'Bash',
    patterns: [{ name: 'echo', argPatterns: [{ kind: 'wildcard' }] }],
  };

  it('returns an empty list for entries with no provisions', () => {
    expect(deriveActiveProvisions([makeEntry('t0')])).toStrictEqual([]);
  });

  it('collects provisions in first-seen order', () => {
    const entries = [
      makeEntry('t0', { provisions: [provA] }),
      makeEntry('t1', { provisions: [provB] }),
    ];
    expect(deriveActiveProvisions(entries)).toStrictEqual([provA, provB]);
  });

  it('deduplicates provisions across entries', () => {
    const entries = [
      makeEntry('t0', { provisions: [provA] }),
      makeEntry('t1', { provisions: [provA, provB] }),
    ];
    expect(deriveActiveProvisions(entries)).toStrictEqual([provA, provB]);
  });

  it('deduplicates across user-granted and auto-provisioned entries with reordered keys', () => {
    // The auto-provisioned path can yield an arg-pattern object with properties in a
    // different source order; provisionKey canonicalises and these must collapse.
    const userGranted: Provision = {
      tool: 'Bash',
      patterns: [
        {
          name: 'ls',
          argPatterns: [{ kind: 'exact', value: '/tmp' }],
        },
      ],
    };
    const autoProvisioned: Provision = {
      tool: 'Bash',
      patterns: [
        {
          name: 'ls',
          argPatterns: [
            { value: '/tmp', kind: 'exact' } as {
              kind: 'exact';
              value: string;
            },
          ],
        },
      ],
    };
    const entries = [
      makeEntry('t0', { provisions: [userGranted] }),
      makeEntry('t1', {
        status: 'provisioned',
        provisions: [autoProvisioned],
      }),
    ];
    expect(deriveActiveProvisions(entries)).toStrictEqual([userGranted]);
  });
});
