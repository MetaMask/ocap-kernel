import '@ocap/shims/endoify';

import { VatSupervisor } from '../../../kernel/dist/VatSupervisor.mjs';
import { makeMapKVStore } from '../../dist/kernel/map-kv-store.mjs';
import { makeCommandStream } from '../../dist/vat/streams.mjs';

console.debug('ping pong');

main().catch(console.error);

/**
 * The main function for the worker. TODO: support pinging and ponging.
 */
async function main() {
  void new VatSupervisor({
    id: 'iframe',
    commandStream: makeCommandStream(),
    makeKVStore: makeMapKVStore,
  });
}
