import type { StreamPair } from '@ocap/streams';

import type { GenericEnvelope, MessageOf } from './envelope.js';
import type { VatId } from './shared.js';

export type EnvelopeChannel<
  Env extends GenericEnvelope<Env>,
  Return = unknown,
> = {
  isEnvelope: (value: unknown) => value is Env;
  sendMessage: (message: MessageOf<Env>) => Promise<Return>;
  handleEnvelope: (envelope: Env) => void;
  open: () => Promise<void>;
  close: (reason?: undefined) => Promise<void>;
};

export type ChannelMaker<Env extends GenericEnvelope<Env>> = (
  vatId: VatId,
  streams: StreamPair<Env>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...additionalArgs: any
) => EnvelopeChannel<Env>;
