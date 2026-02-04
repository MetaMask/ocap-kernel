import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage } from '@metamask/ocap-kernel';

/**
 * Vat providing Monotony As A Service (MaaS). It just keeps relentlessly counting up. It's very boring.
 *
 * Monotonicity: a consistent pattern of always increasing.
 * Monotony: a lack of variety or a tedious sameness.
 * It really could be either.
 *
 * @param _vatPowers - Special powers granted to this vat (not used here).
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @param baggage - Root of vat's persistent state.
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  _vatPowers: unknown,
  parameters: { name?: string },
  baggage: Baggage,
) {
  const name = parameters?.name ?? 'anonymous';
  // eslint-disable-next-line no-console
  console.log(`buildRootObject "${name}"`);
  if (baggage.has('url')) {
    const url = baggage.get('url') as string;
    // eslint-disable-next-line no-console
    console.log(`URL for MaaS: ${url}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`URL for MasS not yet initialized`);
  }

  const myself = makeDefaultExo('root', {
    async bootstrap(
      _vats: unknown,
      services: { ocapURLIssuerService?: unknown },
    ) {
      // eslint-disable-next-line no-console
      console.log(`vat ${name} is bootstrap`);
      const issuer = services.ocapURLIssuerService;
      if (!issuer) {
        // eslint-disable-next-line no-console
        console.log(`no ocapURLIssuerService found`);
        throw Error(`MaaS requires an ocap URL issuer`);
      }
      const url = await E(issuer).issue(myself);
      // eslint-disable-next-line no-console
      console.log(`URL for MaaS: ${url}`);
      baggage.init('url', url);
      baggage.init('count', 1);
      return url;
    },
    getUrl() {
      return baggage.get('url');
    },
    next(from: string) {
      const count = baggage.get('count') as number;
      baggage.set('count', count + 1);
      // eslint-disable-next-line no-console
      console.log(
        `vat ${name} got 'next' request from ${from}, returning ${count}`,
      );
      return count;
    },
  });
  return myself;
}
