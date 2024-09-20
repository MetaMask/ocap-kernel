import type { PromiseKit } from '@endo/promise-kit';
import type { StreamPair, MessageId, StreamEnvelope } from '@ocap/streams';

export type VatId = string;

export type VatWorker = {
  init: () => Promise<[StreamPair<StreamEnvelope>, unknown]>;
  delete: () => Promise<void>;
};

export type PromiseCallbacks = Omit<PromiseKit<unknown>, 'promise'>;

export type UnresolvedMessages = Map<MessageId, PromiseCallbacks>;

export type VatLaunchProps = {
  id: VatId;
  worker: VatWorker;
};
