import type { PromiseKit } from '@endo/promise-kit';
import type { DuplexStream, MultiplexEnvelope } from '@ocap/streams';

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
  ) => Promise<DuplexStream<MultiplexEnvelope, MultiplexEnvelope>>;
  /**
   * Terminate a worker identified by its vat id.
   *
   * @param vatId - The vat id of the worker to terminate.
   * @returns A promise that resolves when the worker has terminated
   * or rejects if that worker does not exist.
   */
  terminate: (vatId: VatId) => Promise<void>;
  /**
   * Terminate all workers managed by the service.
   *
   * @returns A promise that resolves after all workers have terminated
   * or rejects if there was an error during termination.
   */
  terminateAll: () => Promise<void>;
};
