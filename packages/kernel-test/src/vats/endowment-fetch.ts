import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import { unwrapTestLogger } from '../test-powers.ts';
import type { TestPowers } from '../test-powers.ts';

/**
 * Build a root object for a vat that uses the network endowment (`fetch`
 * plus `Request`, `Headers`, `Response` constructors).
 *
 * @param vatPowers - The powers of the vat.
 * @param vatPowers.logger - The logger for the vat.
 * @returns The root object.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function buildRootObject(vatPowers: TestPowers) {
  const tlog = unwrapTestLogger(vatPowers, 'endowment-user');

  tlog('buildRootObject');

  const root = makeDefaultExo('root', {
    bootstrap: () => {
      tlog('bootstrap');
    },
    hello: async (url: string) => {
      try {
        const response = await fetch(url);
        const text = await response.text();
        tlog(`response: ${text}`);
        // Verify hardened Request/Headers/Response constructors are
        // available on a successful path so the test can assert on them.
        tlog(
          `Request constructor: ${new Request(url) instanceof Request ? 'ok' : 'missing'}`,
        );
        tlog(
          `Headers constructor: ${new Headers({ 'x-test': '1' }) instanceof Headers ? 'ok' : 'missing'}`,
        );
        tlog(
          `Response constructor: ${new Response('body') instanceof Response ? 'ok' : 'missing'}`,
        );
        return text;
      } catch (error) {
        tlog(`error: ${String(error)}`);
        throw error;
      }
    },
  });

  return root;
}
