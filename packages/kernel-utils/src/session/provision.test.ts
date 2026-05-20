import { describe, expect, it } from 'vitest';

import {
  argInterval,
  argPatternDisplay,
  argPatternLe,
  compareInvocationPatterns,
  compareProvisions,
  computeAuthority,
  invocationToProvision,
  isPathArg,
  matchArg,
  matchPattern,
  matchProvision,
  pathInterval,
  trivialInterval,
} from './provision.ts';
import type { ArgPattern, InvocationPattern, Provision } from './types.ts';

// ─── helpers ──────────────────────────────────────────────────────────────────

const exact = (value: string): ArgPattern => ({ kind: 'exact', value });
const prefix = (pfx: string): ArgPattern => ({ kind: 'prefix', prefix: pfx });
const wildcard: ArgPattern = { kind: 'wildcard' };

const pat = (
  name: string,
  ...argPatterns: ArgPattern[]
): InvocationPattern => ({
  name,
  argPatterns,
});

const provision = (
  tool: string,
  ...patterns: InvocationPattern[]
): Provision => ({
  tool,
  patterns,
});

// ─── isPathArg ────────────────────────────────────────────────────────────────

describe('isPathArg', () => {
  it.each([
    ['/foo', true],
    ['/a/b/c', true],
    ['./foo', true],
    ['../bar', true],
    ['foo', false],
    ['foo/bar', false],
    ['', false],
  ])('isPathArg(%s) → %s', (input, expected) => {
    expect(isPathArg(input)).toBe(expected);
  });
});

// ─── pathInterval ─────────────────────────────────────────────────────────────

describe('pathInterval', () => {
  it('produces exact + ancestor prefixes + wildcard for an absolute path', () => {
    expect(pathInterval('/a/b/c')).toStrictEqual([
      exact('/a/b/c'),
      prefix('/a/b/'),
      prefix('/a/'),
      prefix('/'),
      wildcard,
    ]);
  });

  it('stops at the root for a single-segment path', () => {
    expect(pathInterval('/foo')).toStrictEqual([
      exact('/foo'),
      prefix('/'),
      wildcard,
    ]);
  });

  it('handles a root-level path', () => {
    // exact('/') is more specific than prefix('/') which covers all absolute paths
    expect(pathInterval('/')).toStrictEqual([
      exact('/'),
      prefix('/'),
      wildcard,
    ]);
  });

  it('produces exact + prefix + wildcard for a relative single-segment path', () => {
    expect(pathInterval('./foo')).toStrictEqual([
      exact('./foo'),
      prefix('./'),
      wildcard,
    ]);
  });
});

// ─── trivialInterval ──────────────────────────────────────────────────────────

describe('trivialInterval', () => {
  it('returns [exact, wildcard]', () => {
    expect(trivialInterval('hello')).toStrictEqual([exact('hello'), wildcard]);
  });
});

// ─── argInterval ──────────────────────────────────────────────────────────────

describe('argInterval', () => {
  it('uses pathInterval for paths', () => {
    expect(argInterval('/tmp/foo')).toStrictEqual(pathInterval('/tmp/foo'));
  });

  it('uses trivialInterval for non-paths', () => {
    expect(argInterval('hello')).toStrictEqual(trivialInterval('hello'));
  });
});

// ─── argPatternDisplay ────────────────────────────────────────────────────────

describe('argPatternDisplay', () => {
  it.each([
    [exact('foo'), 'foo'],
    [prefix('/a/b/'), '/a/b/*'],
    [wildcard, '*'],
  ] as [ArgPattern, string][])('display(%o) → %s', (pattern, expected) => {
    expect(argPatternDisplay(pattern)).toBe(expected);
  });
});

// ─── matchArg ─────────────────────────────────────────────────────────────────

describe('matchArg', () => {
  describe('exact', () => {
    it('matches the exact value', () => {
      expect(matchArg(exact('foo'), 'foo')).toBe(true);
    });
    it('does not match a different value', () => {
      expect(matchArg(exact('foo'), 'bar')).toBe(false);
    });
  });

  describe('prefix', () => {
    it('matches a value that starts with the prefix', () => {
      expect(matchArg(prefix('/a/'), '/a/b')).toBe(true);
    });
    it('does not match a value that does not start with the prefix', () => {
      expect(matchArg(prefix('/a/'), '/b/c')).toBe(false);
    });
  });

  describe('wildcard', () => {
    it('matches any value', () => {
      expect(matchArg(wildcard, 'anything')).toBe(true);
      expect(matchArg(wildcard, '')).toBe(true);
    });
  });
});

// ─── matchPattern ─────────────────────────────────────────────────────────────

describe('matchPattern', () => {
  it('matches exact name and args', () => {
    expect(matchPattern(pat('ls', exact('/tmp')), 'ls', ['/tmp'])).toBe(true);
  });

  it('does not match wrong name', () => {
    expect(matchPattern(pat('ls', exact('/tmp')), 'cat', ['/tmp'])).toBe(false);
  });

  it('truncated: pattern with fewer argPatterns matches trailing-free invocations', () => {
    expect(matchPattern(pat('ls', exact('/tmp')), 'ls', ['/tmp', '-la'])).toBe(
      true,
    );
  });

  it('does not match when pattern has more argPatterns than argv', () => {
    expect(
      matchPattern(pat('ls', exact('/tmp'), exact('-la')), 'ls', ['/tmp']),
    ).toBe(false);
  });

  it('no-arg pattern matches any argv', () => {
    expect(matchPattern(pat('ls'), 'ls', ['-la', '/tmp'])).toBe(true);
    expect(matchPattern(pat('ls'), 'ls', [])).toBe(true);
  });

  it('uses prefix matching for prefix patterns', () => {
    expect(
      matchPattern(pat('cat', prefix('/home/')), 'cat', ['/home/user/file']),
    ).toBe(true);
    expect(
      matchPattern(pat('cat', prefix('/home/')), 'cat', ['/tmp/file']),
    ).toBe(false);
  });
});

// ─── matchProvision ───────────────────────────────────────────────────────────

describe('matchProvision', () => {
  it('matches when tool and all patterns match', () => {
    const prov = provision('Bash', pat('ls', exact('/tmp')));
    expect(matchProvision(prov, 'Bash', [{ name: 'ls', argv: ['/tmp'] }])).toBe(
      true,
    );
  });

  it('does not match wrong tool', () => {
    const prov = provision('Bash', pat('ls', exact('/tmp')));
    expect(matchProvision(prov, 'Read', [{ name: 'ls', argv: ['/tmp'] }])).toBe(
      false,
    );
  });

  it('does not match when invocation count differs from pattern count', () => {
    const prov = provision('Bash', pat('ls'), pat('cat'));
    expect(matchProvision(prov, 'Bash', [{ name: 'ls', argv: [] }])).toBe(
      false,
    );
  });
});

// ─── argPatternLe ─────────────────────────────────────────────────────────────

describe('argPatternLe', () => {
  it('exact ≤ exact(same)', () => {
    expect(argPatternLe(exact('foo'), exact('foo'))).toBe(true);
  });

  it('exact ≤ wildcard', () => {
    expect(argPatternLe(exact('foo'), wildcard)).toBe(true);
  });

  it('wildcard ≤ wildcard', () => {
    expect(argPatternLe(wildcard, wildcard)).toBe(true);
  });

  it('wildcard is NOT ≤ exact', () => {
    expect(argPatternLe(wildcard, exact('foo'))).toBe(false);
  });

  it('exact ≤ matching prefix', () => {
    expect(argPatternLe(exact('/a/b'), prefix('/a/'))).toBe(true);
  });

  it('exact is NOT ≤ non-matching prefix', () => {
    expect(argPatternLe(exact('/x/y'), prefix('/a/'))).toBe(false);
  });

  it('prefix ≤ broader prefix', () => {
    expect(argPatternLe(prefix('/a/b/'), prefix('/a/'))).toBe(true);
  });

  it('prefix is NOT ≤ narrower prefix', () => {
    expect(argPatternLe(prefix('/a/'), prefix('/a/b/'))).toBe(false);
  });

  it('prefix ≤ wildcard', () => {
    expect(argPatternLe(prefix('/a/'), wildcard)).toBe(true);
  });

  it('exact is NOT ≤ different exact', () => {
    expect(argPatternLe(exact('foo'), exact('bar'))).toBe(false);
  });
});

// ─── compareInvocationPatterns ────────────────────────────────────────────────

describe('compareInvocationPatterns', () => {
  it('eq: same name, same argPatterns', () => {
    expect(
      compareInvocationPatterns(
        pat('ls', exact('/tmp')),
        pat('ls', exact('/tmp')),
      ),
    ).toBe('eq');
  });

  it('lt: same name, a is more restricted (more argPatterns, each ≤ corresponding b)', () => {
    // pat('ls', exact('/tmp')) < pat('ls', prefix('/tmp/'))  — exact < prefix
    expect(
      compareInvocationPatterns(
        pat('ls', exact('/tmp')),
        pat('ls', prefix('/')),
      ),
    ).toBe('lt');
  });

  it('gt: a is more permissive', () => {
    expect(
      compareInvocationPatterns(pat('ls', wildcard), pat('ls', exact('/tmp'))),
    ).toBe('gt');
  });

  it('incomparable: different names', () => {
    expect(compareInvocationPatterns(pat('ls'), pat('cat'))).toBe(
      'incomparable',
    );
  });

  it('lt: fewer argPatterns = more permissive (gt from a perspective)', () => {
    // a has 0 args (truncated, covers all), b has 1 arg constraint → a > b
    expect(compareInvocationPatterns(pat('ls'), pat('ls', exact('/tmp')))).toBe(
      'gt',
    );
  });

  it('gt: a has more args = more restricted', () => {
    expect(compareInvocationPatterns(pat('ls', exact('/tmp')), pat('ls'))).toBe(
      'lt',
    );
  });

  it('incomparable: same name, non-ordered argPatterns', () => {
    // exact('/a') vs exact('/b') — neither ≤ the other
    expect(
      compareInvocationPatterns(pat('ls', exact('/a')), pat('ls', exact('/b'))),
    ).toBe('incomparable');
  });
});

// ─── compareProvisions ────────────────────────────────────────────────────────

describe('compareProvisions', () => {
  it('eq: identical provisions', () => {
    const prov = provision('Bash', pat('ls', exact('/tmp')));
    expect(compareProvisions(prov, prov)).toBe('eq');
  });

  it('lt: a is strictly more restricted', () => {
    const a = provision('Bash', pat('ls', exact('/tmp/foo')));
    const b = provision('Bash', pat('ls', prefix('/tmp/')));
    expect(compareProvisions(a, b)).toBe('lt');
  });

  it('gt: a is strictly more permissive', () => {
    const a = provision('Bash', pat('ls', wildcard));
    const b = provision('Bash', pat('ls', exact('/tmp')));
    expect(compareProvisions(a, b)).toBe('gt');
  });

  it('incomparable: different tools', () => {
    const a = provision('Bash', pat('ls'));
    const b = provision('Read', pat('ls'));
    expect(compareProvisions(a, b)).toBe('incomparable');
  });

  it('incomparable: different pattern counts', () => {
    const a = provision('Bash', pat('ls'), pat('cat'));
    const b = provision('Bash', pat('ls'));
    expect(compareProvisions(a, b)).toBe('incomparable');
  });

  it('incomparable: non-ordered multi-component', () => {
    // Component 0: a < b, Component 1: a > b — cosheaf collapses to incomparable
    const a = provision('Bash', pat('ls', exact('/tmp')), pat('cat', wildcard));
    const b = provision(
      'Bash',
      pat('ls', prefix('/')),
      pat('cat', exact('/etc/hosts')),
    );
    expect(compareProvisions(a, b)).toBe('incomparable');
  });
});

// ─── computeAuthority ─────────────────────────────────────────────────────────

describe('computeAuthority', () => {
  it('returns 0.5 for the first provision (no existing)', () => {
    const prov = provision('Bash', pat('ls'));
    expect(computeAuthority(prov, [])).toBe(0.5);
  });

  it('two incomparable provisions both get 0.5', () => {
    const p1 = provision('Bash', pat('ls'));
    const p2 = provision('Bash', pat('cat'));
    const auth1 = computeAuthority(p1, []);
    const records = [{ provision: p1, authority: auth1 }];
    const auth2 = computeAuthority(p2, records);
    expect(auth1).toBe(0.5);
    expect(auth2).toBe(0.5);
  });

  it('more-restricted provision gets lower authority', () => {
    // p_wide (wildcard) added first at 0.5
    // p_narrow (exact) is lt p_wide → authority in (0, 0.5) = 0.25
    const pWide = provision('Bash', pat('ls', wildcard));
    const pNarrow = provision('Bash', pat('ls', exact('/tmp')));
    const authWide = computeAuthority(pWide, []);
    const records = [{ provision: pWide, authority: authWide }];
    const authNarrow = computeAuthority(pNarrow, records);
    expect(authNarrow).toBeLessThan(authWide);
  });

  it('more-permissive provision gets higher authority', () => {
    // p_exact added first at 0.5
    // p_wide (wildcard) is gt p_exact → authority in (0.5, 1) = 0.75
    const pExact = provision('Bash', pat('ls', exact('/tmp')));
    const pWide = provision('Bash', pat('ls', wildcard));
    const authExact = computeAuthority(pExact, []);
    const records = [{ provision: pExact, authority: authExact }];
    const authWide = computeAuthority(pWide, records);
    expect(authWide).toBeGreaterThan(authExact);
  });

  it('midpoint insertion preserves the partial order for a chain of 3', () => {
    // pExact (exact) < pPrefix (prefix) < pWild (wildcard)
    const pExact = provision('Bash', pat('ls', exact('/tmp/foo')));
    const pPrefix = provision('Bash', pat('ls', prefix('/tmp/')));
    const pWild = provision('Bash', pat('ls', wildcard));

    const authExact = computeAuthority(pExact, []);
    const r1 = [{ provision: pExact, authority: authExact }];
    const authPrefix = computeAuthority(pPrefix, r1);
    const r2 = [...r1, { provision: pPrefix, authority: authPrefix }];
    const authWild = computeAuthority(pWild, r2);

    expect(authExact).toBeLessThan(authPrefix);
    expect(authPrefix).toBeLessThan(authWild);
  });

  it('inserting a provision between two existing ones gets the midpoint', () => {
    // exact('/tmp/foo') < prefix('/tmp/') < wildcard
    // Add exact(0.5) and wildcard(0.75) first; prefix slots between them → 0.625
    const pExact = provision('Bash', pat('ls', exact('/tmp/foo')));
    const pWild = provision('Bash', pat('ls', wildcard));
    const pPrefix = provision('Bash', pat('ls', prefix('/tmp/')));

    const authExact = computeAuthority(pExact, []);
    const r1 = [{ provision: pExact, authority: authExact }];
    const authWild = computeAuthority(pWild, r1);
    const r2 = [...r1, { provision: pWild, authority: authWild }];
    const authPrefix = computeAuthority(pPrefix, r2);

    expect(authPrefix).toBeGreaterThan(authExact);
    expect(authPrefix).toBeLessThan(authWild);
    expect(authPrefix).toBe((authExact + authWild) / 2);
  });
});

// ─── invocationToProvision ────────────────────────────────────────────────────

describe('invocationToProvision', () => {
  it('builds an all-exact provision from an invocation', () => {
    const invocations = [{ name: 'ls', argv: ['-la', '/tmp'] }];
    expect(invocationToProvision('Bash', invocations)).toStrictEqual({
      tool: 'Bash',
      patterns: [
        {
          name: 'ls',
          argPatterns: [exact('-la'), exact('/tmp')],
        },
      ],
    });
  });

  it('handles empty argv', () => {
    expect(
      invocationToProvision('Bash', [{ name: 'ls', argv: [] }]),
    ).toStrictEqual({
      tool: 'Bash',
      patterns: [{ name: 'ls', argPatterns: [] }],
    });
  });

  it('handles multiple invocations (pipeline)', () => {
    const invocations = [
      { name: 'ls', argv: ['/tmp'] },
      { name: 'grep', argv: ['foo'] },
    ];
    expect(invocationToProvision('Bash', invocations)).toStrictEqual({
      tool: 'Bash',
      patterns: [
        { name: 'ls', argPatterns: [exact('/tmp')] },
        { name: 'grep', argPatterns: [exact('foo')] },
      ],
    });
  });
});
