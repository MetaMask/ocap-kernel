import '@ocap/shims/endoify';

import { makeMultiplexer } from '../../src/vat/make-multiplexer.mjs';

main().catch(console.error);

/**
 * The main function for the worker. TODO: support pinging and ponging.
 */
async function main() {
  const multiplexer = makeMultiplexer('v0');
  await multiplexer.start();
}
