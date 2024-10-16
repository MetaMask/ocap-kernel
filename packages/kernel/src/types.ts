import type { PromiseKit } from '@endo/promise-kit';
import type { DuplexStream } from '@ocap/streams';

import type { StreamEnvelope, StreamEnvelopeReply } from './stream-envelope.js';

export type VatId = `v${number}`;

export const isVatId = (value: unknown): value is VatId =>
  typeof value === 'string' &&
  value.at(0) === 'v' &&
  value.slice(1) === String(Number(value.slice(1)));

export type PromiseCallbacks<Resolve = unknown> = Omit<
  PromiseKit<Resolve>,
  'promise'
>;

export type VatWorkerService = {
  /**
   * Launch a new worker with a specific vat id.
   *
   * @param vatId - The vat id of the worker to launch.
   * @returns A promise for a duplex stream connected to the worker
   * which rejects if a worker with the given vat id already exists.
   */
  launch: (
    vatId: VatId,
  ) => Promise<DuplexStream<StreamEnvelopeReply, StreamEnvelope>>;
  /**
   * Terminate a worker identified by its vat id.
   *
   * @param vatId - The vat id of the worker to terminate.
   * @returns A promise that resolves when the worker has terminated
   * or rejects if that worker does not exist.
   */
  terminate: (vatId: VatId) => Promise<void>;
  /**
   * Terminate all workers known to the service.
   *
   * @returns A promise for the number of workers deleted.
   */
  terminateAll: () => Promise<void>;
};
