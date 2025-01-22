import '@ocap/shims/endoify';

import { makeCommandStream } from '../../dist/vat/streams.mjs';

main().catch(console.error);

/**
 * The main function for the worker.
 */
async function main() {
  console.debug('top', process.env.NODE_VAT_ID);
  const stream = makeCommandStream();
  await stream.synchronize();
  console.debug('bot', process.env.NODE_VAT_ID);
}
