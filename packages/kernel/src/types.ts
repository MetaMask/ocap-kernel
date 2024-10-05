import type { PromiseKit } from '@endo/promise-kit';
import type { DuplexStream } from '@ocap/streams';

import type { StreamEnvelopeReply, StreamEnvelope } from './stream-envelope.js';

export type VatId = `v${number}`;

export const isVatId = (value: unknown): value is VatId =>
  typeof value === 'string' &&
  value.at(0) === 'v' &&
  value.slice(1) === String(Number(value.slice(1)));

export type VatWorker = {
  init: () => Promise<
    [DuplexStream<StreamEnvelopeReply, StreamEnvelope>, unknown]
  >;
  delete: () => Promise<void>;
};

export type PromiseCallbacks = Omit<PromiseKit<unknown>, 'promise'>;
