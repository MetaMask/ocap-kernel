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
export function makeVatWorker(
  vatId: VatId,
  makeMultiplexer: (name?: string) => StreamMultiplexer,
  makeKVStore: MakeKVStore,
): {
  start: () => Promise<void>;
  stop: () => Promise<void>;
} {
  const multiplexer = makeMultiplexer(vatId);
  const commandStream = multiplexer.createChannel<VatCommand, VatCommandReply>(
    'command',
    isVatCommand,
  );

  const supervisor = new VatSupervisor({
    id: `S${vatId}`,
    commandStream,
    makeKVStore,
  });

  return {
    start: async () => {
      await multiplexer.start();
    },
    stop: async () => {
      await supervisor.terminate();
      await multiplexer.return();
    },
  };
}
