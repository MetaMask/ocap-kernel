/**
 * Reviser capability helper for the orchestration-demo service vats.
 *
 * Every "up to N revisions" description in this package is implemented
 * the same way: the first (paid) call to a service returns both the
 * initial artifact and an ocap URL — the reviser — that the buyer can
 * redeem to request further revisions at no additional charge. The
 * reviser is a per-purchase capability: fresh exo, fresh URL, private
 * counter of remaining revisions closed over in module scope.
 *
 * Purpose in the demo: an ocap idiom that reads clearly in the service
 * source. The paid call mints a delegated capability; the LLM buyer
 * holds it; the seller enforces the revision budget without needing
 * to authenticate the buyer or hand out per-call payment credentials.
 * No shared secret, no MAC verification — the capability itself IS the
 * proof of purchase.
 */
import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';
import type { ContactPoint } from '@metamask/service-discovery-types';
import type { ServicePoint } from '@metamask/service-discovery-types';

import { makeContactEndpoint } from './contact-endpoint.ts';
import { getRemotableSpec } from './describe.ts';
import { makeRegistrationToken } from './registration-token.ts';

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
      'the reviser URL; no payment argument required.',
  },
};

/**
 * Issue a per-purchase revision capability. Builds a fresh reviser exo
 * with its own remaining-budget counter, wraps it in a ContactPoint so
 * the buyer can redeem the URL through the same `service_initiate_contact`
 * path they use for any other service, and issues an ocap URL for the
 * ContactPoint.
 *
 * The caller is responsible for holding the returned `anchor` in a
 * long-lived reference (typically a module-level Set) so the kernel
 * doesn't garbage-collect the reviser between issuance and the buyer's
 * first `revise` call. See `packages/orchestration-demo-vats/src/wallet/index.ts`
 * for the earlier lesson: URL issuance alone does not keep an exo alive.
 *
 * @param options - Construction options.
 * @param options.providerTag - Provider tag of the issuing service
 *   (e.g. `'sunnyvale-industrial-design-services'`). Used in exo names,
 *   error messages, and the ContactPoint's `providerTag` field.
 * @param options.purchaseId - Unique tag identifying this specific
 *   purchase (e.g. `'sale-1'`). Combined with `providerTag` to keep exo
 *   names unique across purchases from the same vat.
 * @param options.remaining - Number of free revisions this capability
 *   grants. The count is decremented on each successful `revise` call;
 *   the reviser throws once it hits zero.
 * @param options.description - Natural-language description surfaced by
 *   the ContactPoint. Should state the remaining budget and the
 *   revision numbering so the LLM buyer reads a coherent story.
 * @param options.onRevise - Callback the reviser invokes to produce the
 *   next artifact. Receives the 1-indexed revision number (starting at
 *   2, since rev1 is the initial paid draft) and the buyer's feedback
 *   text. Whatever it returns is what `revise()` returns; the caller
 *   picks the artifact shape.
 * @param options.issueUrl - Closure that mints an ocap URL for the
 *   ContactPoint. Provided by the vat root, which is the only holder of
 *   the vat's `ocapURLIssuerService`.
 * @returns The minted URL plus an opaque anchor the caller must hold
 *   in module scope to prevent premature GC of the reviser.
 */
export async function issueRevisionCapability<Artifact>(options: {
  providerTag: string;
  purchaseId: string;
  remaining: number;
  description: string;
  onRevise: (revNumber: number, feedback: string) => Artifact;
  issueUrl: (endpoint: ContactPoint) => Promise<string>;
}): Promise<{ reviseUrl: string; anchor: unknown }> {
  const {
    providerTag,
    purchaseId,
    remaining: initialRemaining,
    description,
    onRevise,
    issueUrl,
  } = options;

  let remaining = initialRemaining;
  // First delivered draft is rev1; the reviser hands out rev2, rev3, ...
  let nextRevNumber = 2;

  const reviserName = `${providerTag}-${purchaseId}-reviser`;

  const reviser = makeDiscoverableExo(
    reviserName,
    {
      async revise(feedback: string): Promise<Artifact> {
        if (remaining <= 0) {
          throw new Error(
            `${reviserName}: revision budget exhausted. Purchase a new ` +
              'draft from the same service to continue iterating.',
          );
        }
        remaining -= 1;
        const revNumber = nextRevNumber;
        nextRevNumber += 1;
        return harden(onRevise(revNumber, feedback));
      },
    },
    {
      revise: {
        description:
          'Produce the next revision of the artifact this reviser was ' +
          'issued for. Free of charge for the holder of this URL; the ' +
          'purchase that minted the reviser already paid for it. Throws ' +
          'when the revision budget is exhausted.',
        args: REVISE_ARG_SCHEMA,
        returns: {
          type: 'object' as const,
          description:
            'Artifact descriptor for the next revision, same shape as ' +
            'the artifact returned by the original paid call.',
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
      },
    },
  );

  const remotableSpec = await getRemotableSpec(reviser, description);

  let capturedUrl = '';
  const contact = makeContactEndpoint({
    name: `${reviserName}Contact`,
    service: reviser as unknown as ServicePoint,
    description,
    remotableSpec,
    getContactUrl: () => capturedUrl,
    // The reviser is not registered with a matcher; its URL is
    // handed directly to the buyer via the paid call's return
    // value. The registration token is required by makeContactEndpoint
    // but is never presented by anyone.
    expectedToken: makeRegistrationToken(),
    providerTag: `${providerTag}-reviser`,
  });
  capturedUrl = await issueUrl(contact);

  // Anchor everything the URL depends on so nothing gets collected
  // between issuance and the buyer's first `revise` call. The caller
  // stores this in a Set; we never look at it again.
  const anchor = harden({ reviser, contact });

  return { reviseUrl: capturedUrl, anchor };
}
