import type {
  ArgPattern,
  InvocationPattern,
  ParsedInvocation,
  Provision,
} from './types.ts';

/**
 * Returns true if the string looks like a file-system path (absolute or relative).
 *
 * @param str - The string to test.
 * @returns True when the string starts with `/`, `./`, or `../`.
 */
export function isPathArg(str: string): boolean {
  return str.startsWith('/') || str.startsWith('./') || str.startsWith('../');
}

/**
 * Build the ordered lattice of ArgPatterns for a path argument.
 *
 * Example: `/a/b/c` →
 *   exact('/a/b/c') · prefix('/a/b/') · prefix('/a/') · prefix('/') · wildcard
 *
 * @param str - A path string (absolute or relative).
 * @returns The ArgPattern lattice from most- to least-specific.
 */
export function pathInterval(str: string): ArgPattern[] {
  const result: ArgPattern[] = [{ kind: 'exact', value: str }];
  let path = str;
  for (;;) {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash < 0) {
      break;
    }
    if (lastSlash === 0) {
      result.push({ kind: 'prefix', prefix: '/' });
      break;
    }
    result.push({ kind: 'prefix', prefix: path.slice(0, lastSlash + 1) });
    path = path.slice(0, lastSlash);
  }
  result.push({ kind: 'wildcard' });
  return result;
}

/**
 * Build the two-element lattice for a non-path argument: exact or wildcard.
 *
 * @param str - The argument value.
 * @returns `[exact(str), wildcard]`.
 */
export function trivialInterval(str: string): ArgPattern[] {
  return [{ kind: 'exact', value: str }, { kind: 'wildcard' }];
}

/**
 * Choose the appropriate interval for an argument based on whether it is a path.
 *
 * @param str - The argument value.
 * @returns A path interval for file-system paths, trivial interval otherwise.
 */
export function argInterval(str: string): ArgPattern[] {
  return isPathArg(str) ? pathInterval(str) : trivialInterval(str);
}

/**
 * Format an ArgPattern as a display string.
 *
 * @param pattern - The pattern to display.
 * @returns A human-readable string representation.
 */
export function argPatternDisplay(pattern: ArgPattern): string {
  switch (pattern.kind) {
    case 'exact':
      return pattern.value;
    case 'prefix':
      return `${pattern.prefix}*`;
    case 'wildcard':
      return '*';
    default:
      throw new Error(
        `Unknown ArgPattern kind: ${(pattern as ArgPattern).kind}`,
      );
  }
}

/**
 * Returns true if `pattern` matches `value`.
 *
 * @param pattern - The ArgPattern to test against.
 * @param value - The argument value to test.
 * @returns True when the value satisfies the pattern.
 */
export function matchArg(pattern: ArgPattern, value: string): boolean {
  switch (pattern.kind) {
    case 'exact':
      return pattern.value === value;
    case 'prefix':
      return value.startsWith(pattern.prefix);
    case 'wildcard':
      return true;
    default:
      throw new Error(
        `Unknown ArgPattern kind: ${(pattern as ArgPattern).kind}`,
      );
  }
}

/**
 * Returns true if `pattern` matches the given `(name, argv)` invocation.
 *
 * Uses truncated matching: the pattern need only specify argPatterns for the
 * leading arguments it cares about. Trailing arguments are unconstrained.
 *
 * @param pattern - The InvocationPattern to test.
 * @param name - The command/tool name.
 * @param argv - The argument list.
 * @returns True when name matches and each specified argPattern matches.
 */
export function matchPattern(
  pattern: InvocationPattern,
  name: string,
  argv: string[],
): boolean {
  if (pattern.name !== name) {
    return false;
  }
  if (pattern.argPatterns.length > argv.length) {
    return false;
  }
  return pattern.argPatterns.every((argPat, i) =>
    matchArg(argPat, argv[i] as string),
  );
}

/**
 * Returns true if `provision` covers the given `(tool, invocations)` call.
 *
 * The provision matches only when its tool name matches and each of its patterns
 * positionally matches the corresponding component invocation (cosheaf: all must
 * match).
 *
 * @param provision - The Provision to test.
 * @param tool - The tool name from the hook payload.
 * @param invocations - The parsed command components.
 * @returns True when the provision covers this invocation.
 */
export function matchProvision(
  provision: Provision,
  tool: string,
  invocations: ParsedInvocation[],
): boolean {
  if (provision.tool !== tool) {
    return false;
  }
  if (provision.patterns.length !== invocations.length) {
    return false;
  }
  return provision.patterns.every((pattern, i) => {
    const inv = invocations[i] as ParsedInvocation;
    return matchPattern(pattern, inv.name, inv.argv);
  });
}

// ─── Partial order (authority embedding) ─────────────────────────────────────

/**
 * Returns true when ArgPattern `a` covers a subset of what `b` covers —
 * i.e., `a` is at least as restrictive as `b`.
 *
 * Partial order: exact ≤ matching-prefix ≤ broader-prefix ≤ wildcard.
 *
 * @param a - The candidate "more restricted" pattern.
 * @param b - The candidate "more permissive" pattern.
 * @returns True when a's coverage ⊆ b's coverage.
 */
export function argPatternLe(a: ArgPattern, b: ArgPattern): boolean {
  if (b.kind === 'wildcard') {
    return true;
  }
  if (a.kind === 'wildcard') {
    return false;
  }
  if (b.kind === 'prefix') {
    if (a.kind === 'exact') {
      return a.value.startsWith(b.prefix);
    }
    return a.prefix.startsWith(b.prefix);
  }
  // b is exact: only equal exact matches
  return a.kind === 'exact' && a.value === b.value;
}

export type PatternOrder = 'lt' | 'eq' | 'gt' | 'incomparable';

/**
 * Compare two InvocationPatterns in the partial order of coverage.
 *
 * Handles different argPattern lengths: a pattern with fewer entries uses
 * truncated matching and therefore covers a superset of one with more entries
 * (all else equal), so it is "above" (more permissive) in the order.
 *
 * @param a - First pattern.
 * @param b - Second pattern.
 * @returns The order relation: a < b means a is more restricted (covers less).
 */
export function compareInvocationPatterns(
  a: InvocationPattern,
  b: InvocationPattern,
): PatternOrder {
  if (a.name !== b.name) {
    return 'incomparable';
  }
  // a ≤ b: a.argPatterns.length ≥ b.argPatterns.length (more constraints) AND
  // each of b's patterns is at least as permissive as the corresponding a pattern.
  const aLe =
    a.argPatterns.length >= b.argPatterns.length &&
    b.argPatterns.every((bp, i) =>
      argPatternLe(a.argPatterns[i] as ArgPattern, bp),
    );
  const bLe =
    b.argPatterns.length >= a.argPatterns.length &&
    a.argPatterns.every((ap, i) =>
      argPatternLe(b.argPatterns[i] as ArgPattern, ap),
    );
  if (aLe && bLe) {
    return 'eq';
  }
  if (aLe) {
    return 'lt';
  }
  if (bLe) {
    return 'gt';
  }
  return 'incomparable';
}

/**
 * Compare two Provisions in the coverage partial order (cosheaf structure:
 * all pipeline components must be ordered in the same direction).
 *
 * @param a - First provision.
 * @param b - Second provision.
 * @returns The order relation: a < b means a is more restricted than b.
 */
export function compareProvisions(a: Provision, b: Provision): PatternOrder {
  if (a.tool !== b.tool) {
    return 'incomparable';
  }
  if (a.patterns.length !== b.patterns.length) {
    return 'incomparable';
  }
  let hasLt = false;
  let hasGt = false;
  for (let i = 0; i < a.patterns.length; i++) {
    const cmp = compareInvocationPatterns(
      a.patterns[i] as InvocationPattern,
      b.patterns[i] as InvocationPattern,
    );
    if (cmp === 'incomparable') {
      return 'incomparable';
    }
    if (cmp === 'lt') {
      hasLt = true;
    }
    if (cmp === 'gt') {
      hasGt = true;
    }
    if (hasLt && hasGt) {
      return 'incomparable';
    }
  }
  if (hasLt) {
    return 'lt';
  }
  if (hasGt) {
    return 'gt';
  }
  return 'eq';
}

/**
 * Compute the authority value for a new provision given the existing sections.
 *
 * Embeds the dynamically-growing partial order into (0, 1): the authority of
 * a new provision is the midpoint between the supremum of authority values
 * strictly below it and the infimum of authority values strictly above it.
 *
 * Properties:
 *   - a < b (a more restricted) ⟹ authority(a) < authority(b)
 *   - Incomparable provisions that are added simultaneously both receive 0.5
 *   - The embedding is monotone and preserved under future insertions
 *
 * @param provision - The provision being added.
 * @param existing - The current sections with their computed authority values.
 * @returns An authority value in (0, 1).
 */
export function computeAuthority(
  provision: Provision,
  existing: readonly { provision: Provision; authority: number }[],
): number {
  let limSupDown = 0; // max authority strictly below this provision
  let limInfUp = 1; // min authority strictly above this provision
  for (const entry of existing) {
    const cmp = compareProvisions(entry.provision, provision);
    if (cmp === 'lt') {
      if (entry.authority > limSupDown) {
        limSupDown = entry.authority;
      }
    } else if (cmp === 'gt') {
      if (entry.authority < limInfUp) {
        limInfUp = entry.authority;
      }
    }
  }
  return (limSupDown + limInfUp) / 2;
}

// ─── Exact grant helper ───────────────────────────────────────────────────────

/**
 * Convert an exact invocation into a Provision (all-exact argPatterns).
 * Used to record a single-invocation grant as a point section in the sheaf.
 *
 * @param tool - The tool name.
 * @param invocations - The parsed command components.
 * @returns A Provision whose patterns exactly match this invocation.
 */
export function invocationToProvision(
  tool: string,
  invocations: ParsedInvocation[],
): Provision {
  return {
    tool,
    patterns: invocations.map(({ name, argv }) => ({
      name,
      argPatterns: argv.map((value) => ({ kind: 'exact' as const, value })),
    })),
  };
}
