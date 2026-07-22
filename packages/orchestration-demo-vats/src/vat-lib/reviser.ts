/**
 * Reviser capability helper for the orchestration-demo service vats.
 *
 * Every "up to N revisions" description in this package is implemented
 * the same way: the first (paid) call to a service returns both the
 * initial artifact and a reviser exo — a fresh delegated capability
 * the buyer holds directly (no URL indirection). The buyer calls
 * `revise(feedback)` on that reviser to request the next revision at
 * no additional charge. When the per-purchase budget is exhausted,
 * `revise` throws.
 *
 * Purpose in the demo: an ocap idiom that reads clearly in the service
 * source. The paid call mints a delegated capability; the LLM buyer
 * holds it as a live object reference; the seller enforces the
 * revision budget without needing to authenticate the buyer or hand
 * out per-call payment credentials. No shared secret, no MAC
 * verification — the capability itself IS the proof of purchase.
 */
import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

/**
 * Shape of a reviser exo. `revise(feedback)` returns the next artifact
 * in the sequence and consumes one entry from the revision budget.
 * Throws when the budget is exhausted.
 */
export type Reviser<Artifact> = {
  revise: (feedback: string) => Promise<Artifact>;
};

/**
 * Argument schema for the `revise` method. Reusable across services so
 * every reviser reads the same on the LLM side.
 */
export const REVISE_ARG_SCHEMA = {
  feedback: {
    type: 'string' as const,
    description:
      'Free-text feedback describing what to change in the next pass. ' +
      'The reviser incorporates the feedback and returns a new artifact ' +
      'in the same sequence (rev2, rev3, ...). Free to the holder of ' +
      'this reviser reference; no payment argument required.',
  },
};

/**
 * Method-schema block for the `revise` method. Reusable across
 * services so every reviser advertises the same discoverable API.
 */
export const REVISE_METHOD_SCHEMA = {
  description:
    'Produce the next revision of the artifact this reviser was ' +
    'issued for. Free of charge to the holder of this reviser reference; ' +
    'the purchase that minted the reviser already paid for it. Throws ' +
    'when the revision budget is exhausted.',
  args: REVISE_ARG_SCHEMA,
  returns: {
    type: 'object' as const,
    description:
      'Artifact descriptor for the next revision, same shape as the ' +
      'artifact returned by the original paid call.',
    properties: {
      kind: {
        type: 'string' as const,
        description:
          'Artifact kind, matching the original paid call ' +
          "(e.g. 'svg' for concept sketches).",
      },
      data: {
        type: 'string' as const,
        description: 'Raw artifact payload as a single string.',
      },
      fromService: {
        type: 'string' as const,
        description: 'Provider tag of the service that produced this.',
      },
    },
    required: ['kind', 'data', 'fromService'],
  },
};

/**
 * Build a per-purchase reviser exo. Fresh state, fresh identity, held
 * by the caller (via the returned reference; the caller is responsible
 * for anchoring the exo in module scope so the kernel doesn't collect
 * it between issuance and the buyer's first `revise` call — see
 * `packages/orchestration-demo-vats/src/wallet/index.ts` for the
 * earlier OBJECT_DELETED lesson).
 *
 * @param options - Construction options.
 * @param options.name - Exo name. Should identify the issuing service
 *   and the specific purchase (e.g.
 *   `'sunnyvale-industrial-design-services-sale-1-reviser'`) so it
 *   reads clearly on the LLM side after it's auto-registered by the
 *   discovery plugin.
 * @param options.remaining - Number of free revisions this reviser
 *   grants. Decremented on each successful `revise`; the reviser
 *   throws once it hits zero.
 * @param options.onRevise - Callback invoked to produce the next
 *   artifact. Receives the 1-indexed revision number (starting at 2,
 *   since rev1 is the initial paid draft) and the buyer's feedback
 *   text.
 * @returns A discoverable reviser exo.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeReviser<Artifact>(options: {
  name: string;
  remaining: number;
  onRevise: (revNumber: number, feedback: string) => Artifact;
}) {
  const { name, remaining: initialRemaining, onRevise } = options;

  let remaining = initialRemaining;
  // First delivered draft is rev1; the reviser hands out rev2, rev3, ...
  let nextRevNumber = 2;

  return makeDiscoverableExo(
    name,
    {
      async revise(feedback: string): Promise<Artifact> {
        if (remaining <= 0) {
          throw new Error(
            `${name}: revision budget exhausted. Purchase a new draft ` +
              'from the same service to continue iterating.',
          );
        }
        remaining -= 1;
        const revNumber = nextRevNumber;
        nextRevNumber += 1;
        return harden(onRevise(revNumber, feedback));
      },
    },
    {
      revise: REVISE_METHOD_SCHEMA,
    },
  );
}
