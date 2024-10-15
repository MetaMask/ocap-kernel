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
  launch: (
    vatId: VatId,
  ) => Promise<DuplexStream<StreamEnvelopeReply, StreamEnvelope>>;
  terminate: (vatId: VatId) => Promise<void>;
};
