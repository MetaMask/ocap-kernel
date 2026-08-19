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
    // Attempt the CWE-367 escape from the HackerOne report: hand `fetch` an
    // input that names an allowlisted host on its first read and a forbidden
    // one thereafter, hoping the caveat validates the former while the
    // network reaches the latter.
    fetchWithTwoFacedUrl: async (decoyUrl: string, targetUrl: string) => {
      let reads = 0;
      const twoFaced = {
        toString: () => {
          reads += 1;
          return reads === 1 ? decoyUrl : targetUrl;
        },
      };
      try {
        const response = await fetch(twoFaced as unknown as RequestInfo);
        tlog(`fetched: ${response.headers.get('x-fetched-url')}`);
      } catch (error) {
        tlog(`error: ${String(error)}`);
      }
      tlog(`reads: ${reads}`);
    },
    // The same escape via a `Request` subclass whose `url` getter lies, while
    // its internal slot — the one `fetch` reads — holds the forbidden host.
    fetchWithSpoofedRequest: async (decoyUrl: string, targetUrl: string) => {
      /** A `Request` whose reported URL differs from its internal one. */
      class SpoofedRequest extends Request {
        /** @returns The decoy URL, not the URL this request was built with. */
        override get url(): string {
          return decoyUrl;
        }
      }
      try {
        const response = await fetch(new SpoofedRequest(targetUrl));
        tlog(`fetched: ${response.headers.get('x-fetched-url')}`);
      } catch (error) {
        tlog(`error: ${String(error)}`);
      }
    },
  });

  return root;
}
