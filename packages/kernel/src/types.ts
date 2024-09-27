import type { PromiseKit } from '@endo/promise-kit';
import type { StreamPair } from '@ocap/streams';

import type { StreamEnvelopeReply, StreamEnvelope } from './stream-envelope.js';

export type MessageId = string;

export type VatId = string;

export type VatWorker = {
  init: () => Promise<
    [StreamPair<StreamEnvelopeReply, StreamEnvelope>, unknown]
  >;
  delete: () => Promise<void>;
};

export type PromiseCallbacks = Omit<PromiseKit<unknown>, 'promise'>;

export type UnresolvedMessages = Map<MessageId, PromiseCallbacks>;
