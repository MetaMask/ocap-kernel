import { isVatCommand, VatSupervisor } from '@ocap/kernel';
import type {
  MakeKVStore,
  VatCommand,
  VatCommandReply,
  VatId,
} from '@ocap/kernel';
import type { StreamMultiplexer } from '@ocap/streams';

/**
 * Assemble a vat worker for the target environment.
 *
 * @param vatId - The id of the vat inside the worker.
 * @param makeMultiplexer - A routine to make a Multiplexer for the VatSupervisor.
 * @param makeKVStore - A routine to make a KVStore for the VatSupervisor.
 * @returns A vat worker object with awaitable start and stop methods.
 */
export async function startVatWorker(
  vatId: VatId,
  makeMultiplexer: (name?: string) => StreamMultiplexer,
  makeKVStore: MakeKVStore,
): Promise<void> {
  const multiplexer = makeMultiplexer(vatId);
  // We must start the multiplexer here, not later.
  multiplexer.start().catch(console.error);
  const commandStream = multiplexer.createChannel<VatCommand, VatCommandReply>(
    'command',
    isVatCommand,
  );

  // eslint-disable-next-line no-new
  new VatSupervisor({
    id: `S${vatId}`,
    commandStream,
    makeKVStore,
  });
}
