/**
 * Permission tracker vat for the caprock plugin.
 *
 * Runs inside the ocap-kernel and maintains the permission sheaf for a single
 * Claude Code session. Launched fresh per-session; authority only grows.
 *
 * Sheaf model:
 *   - Each provider is a Provider<{ authority: number }>.
 *   - The guard restricts to the provision's tool; the identity exo checks
 *     patterns and throws on mismatch (enabling the policy to try next).
 *   - Authority values embed the partial order into (0, 1) via midpoint
 *     insertion (see computeAuthority). The leastAuthority policy sorts
 *     candidates ascending so the most-restricted matching section wins.
 *
 * Build: run `yarn workspace @ocap/caprock build:vat` to produce
 * `vat/permission-tracker.bundle`, which is committed alongside this source.
 */

import { M } from '@endo/patterns';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Provision,
  ParsedInvocation,
} from '@metamask/kernel-utils/session';
import { computeAuthority, matchPattern } from '@metamask/kernel-utils/session';
import { constant, makeSection, sheafify } from '@metamask/sheaves';
import type { Candidate, Provider } from '@metamask/sheaves';

/**
 * Policy that tries candidates from most-restricted to least-restricted, using
 * the numeric `authority` metadata key as the topological rank.
 *
 * Authority values are produced by `computeAuthority` from
 * `@metamask/kernel-utils/session`, which embeds the provision partial order
 * into (0, 1): lower authority ⟹ more restricted. Candidates without an
 * `authority` entry (e.g. when all authorities are identical and the key is
 * collapsed to constraints) are treated as 0.5.
 *
 * @param candidates - Candidates to rank and yield.
 * @yields Candidates sorted ascending by authority.
 */
async function* leastAuthority<M extends Record<string, unknown>>(
  candidates: Candidate<Partial<M>>[],
): AsyncGenerator<Candidate<Partial<M>>, void, unknown[]> {
  yield* [...candidates].sort((a, b) => {
    const aAuth = (a.metadata as { authority?: number }).authority ?? 0.5;
    const bAuth = (b.metadata as { authority?: number }).authority ?? 0.5;
    return aAuth - bAuth;
  });
}

type SectionRecord = { provision: Provision; authority: number };
// idx is included so collapseEquivalent never merges distinct providers
// that happen to share the same authority value (incomparable provisions).
type Meta = { authority: number; idx: number };
type PermissionSection = {
  route: (
    tool: string,
    invocations: ParsedInvocation[],
  ) => Promise<ParsedInvocation[]>;
};

// Permissive outer guard for the dispatch section.
const SECTION_GUARD = harden(
  M.interface('permissions:section', {
    route: M.call(M.string(), M.arrayOf(M.any())).returns(M.any()),
  }),
);

/**
 * Build a Provider for one Provision with its computed authority value.
 *
 * The guard restricts to invocations targeting the provision's tool. The
 * identity exo returns the invocations unchanged if all patterns match,
 * or throws if they do not — enabling leastAuthority to try the next
 * candidate on failure.
 *
 * @param provision - The Provision to encode.
 * @param idx - Index used to name the section exo.
 * @param authority - Pre-computed authority value in (0, 1).
 * @returns A Provider with guard, identity exo, and authority metadata.
 */
function provisionToProvider(
  provision: Provision,
  idx: number,
  authority: number,
): Provider<Meta> {
  const guard = M.interface(`permission:${idx}`, {
    route: M.call(M.eq(provision.tool), M.arrayOf(M.any())).returns(M.any()),
  });

  const exo = makeSection(`permission:${idx}`, harden(guard), {
    route(_tool: string, invocations: ParsedInvocation[]): ParsedInvocation[] {
      if (invocations.length !== provision.patterns.length) {
        throw new Error(
          `invocation count mismatch: expected ${provision.patterns.length}, got ${invocations.length}`,
        );
      }
      for (let i = 0; i < provision.patterns.length; i++) {
        const pattern = provision.patterns[
          i
        ] as (typeof provision.patterns)[number];
        const inv = invocations[i] as ParsedInvocation;
        if (!matchPattern(pattern, inv.name, inv.argv)) {
          throw new Error(`pattern mismatch at index ${i}`);
        }
      }
      return invocations;
    },
  });

  return harden({ exo, metadata: constant({ authority, idx }) });
}

/**
 * Build the root object for the permission-tracker vat.
 *
 * @returns The exo capability object exposed as the vat's bootstrap.
 */
export function buildRootObject(): ReturnType<typeof makeDefaultExo> {
  let sectionRecords: SectionRecord[] = [];
  let providers: Provider<Meta>[] = [];
  let currentSection: PermissionSection | null = null;

  /**
   *
   */
  function rebuildSection(): void {
    if (providers.length === 0) {
      currentSection = null;
      return;
    }
    const sheaf = sheafify({ name: 'permissions', providers });
    currentSection = sheaf.getSection({
      guard: SECTION_GUARD,
      policy: leastAuthority,
    }) as unknown as PermissionSection;
  }

  return makeDefaultExo('permission-tracker', {
    // eslint-disable-next-line no-empty-function
    bootstrap(): void {},

    /**
     * Dispatch the permission sheaf: returns 'allow' if any section's handler
     * accepts this invocation (identity), 'ask' if all throw or sheaf is empty.
     * leastAuthority ensures the most-restricted matching section is tried first.
     *
     * @param tool - The tool name.
     * @param invocations - The parsed command components.
     * @returns 'allow' or 'ask'.
     */
    async route(
      tool: string,
      invocations: ParsedInvocation[],
    ): Promise<string> {
      if (currentSection === null) {
        return 'ask';
      }
      try {
        await currentSection.route(tool, invocations);
        return 'allow';
      } catch {
        return 'ask';
      }
    },

    /**
     * Add a section to the sheaf. Computes the authority value by embedding
     * the provision's position in the partial order into (0, 1).
     *
     * @param provision - The Provision to add.
     */
    addSection(provision: Provision): void {
      const hardened = harden(provision);
      const authority = computeAuthority(hardened, sectionRecords);
      const idx = providers.length;
      sectionRecords = [...sectionRecords, { provision: hardened, authority }];
      providers = [...providers, provisionToProvider(hardened, idx, authority)];
      rebuildSection();
    },

    /**
     * Return the current section count (for session_end stats).
     *
     * @returns The number of sections in the sheaf.
     */
    size(): number {
      return providers.length;
    },
  });
}
