import type { PromiseKit } from '@endo/promise-kit';
import type { StreamPair } from '@ocap/streams';
import type { StreamEnvelope } from '@ocap/utils';

export type MessageId = string;

export type VatId = string;

export type VatWorker = {
  init: () => Promise<[StreamPair<StreamEnvelope>, unknown]>;
  delete: () => Promise<void>;
};

export type PromiseCallbacks = Omit<PromiseKit<unknown>, 'promise'>;

export type UnresolvedMessages = Map<MessageId, PromiseCallbacks>;
