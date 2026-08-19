import '@metamask/kernel-shims/endoify-node';
import { makeNodeJsVatSupervisor } from '@metamask/kernel-node-runtime';
import { Logger } from '@metamask/logger';
import type { VatId } from '@metamask/ocap-kernel';

const LOG_TAG = 'nodejs-test-vat-worker';

let logger = new Logger(LOG_TAG);

// The Snaps network factory reads `globalThis.fetch` at call time, so stub
// it before the supervisor is constructed. Endoify hardens intrinsics but
// not `globalThis.fetch`, so the override sticks.
// Read a `Request`'s URL the way a real `fetch` does, without `new Request()`,
// which would consume the caller's body as a side effect. Deliberately
// unbound: applied to whichever `Request` this fetch is handed.
// eslint-disable-next-line @typescript-eslint/unbound-method
const getRequestUrl = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(new Request('http://x.test')) as Request,
  'url',
)?.get as (this: Request) => string;

globalThis.fetch = async (input, init) => {
  // Resolved independently of the code under test, so an input that resolves
  // differently on a second read shows up here as a mismatch. Logged as a
  // string because a `Request` crosses the log stream as `{}`.
  const target =
    input instanceof Request ? getRequestUrl.call(input) : String(input);
  logger.debug('fetch', target);
  // A `redirectTo` query names where this request is to be answered with a
  // redirect, so a test can drive a per-hop redirect check.
  const redirectTo = new URL(target).searchParams.get('redirectTo');
  if (redirectTo) {
    return new Response('', {
      status: 302,
      headers: { location: redirectTo },
    });
  }
  // Report the target back in a header too, so a test can assert that the URL
  // reached by fetch is the one the caveat approved, and the redirect mode it
  // was asked for, which has to survive the Snaps endowment wrapping this.
  return new Response('Hello, world!', {
    headers: {
      'x-fetched-url': target,
      'x-redirect-mode': String(init?.redirect),
    },
  });
};

main().catch((reason) => logger.error('main exited with error', reason));

/**
 * The main function for the vat worker.
 */
async function main(): Promise<void> {
  // eslint-disable-next-line n/no-process-env
  const vatId = process.env.NODE_VAT_ID as VatId;
  if (!vatId) {
    throw new Error('no vatId set for env variable NODE_VAT_ID');
  }
  const { logger: streamLogger } = await makeNodeJsVatSupervisor(
    vatId,
    LOG_TAG,
  );
  logger = streamLogger;
  logger.debug('vat-worker main');
}
