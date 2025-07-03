import '../../dist/env/endoify.mjs';
import { makeStreams } from '../../dist/vat/streams.mjs';

main().catch(console.error);

/**
 * The main function for the test worker.
 * No supervisor is created, but the stream is synchronized for comms testing.
 */
async function main() {
  await makeStreams();
}
