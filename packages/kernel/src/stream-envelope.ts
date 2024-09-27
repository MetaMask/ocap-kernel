import { makeStreamEnvelopeKit } from '@ocap/streams';

import { isCapTpMessage, isVatCommand, isVatCommandReply } from './command.js';
import type { CapTpMessage, VatCommand, VatCommandReply } from './command.js';

type GuardType<TypeGuard> = TypeGuard extends (
  value: unknown,
) => value is infer Type
  ? Type
  : never;

// Declare and destructure the envelope kit.

enum EnvelopeLabel {
  Command = 'command',
  CapTp = 'capTp',
}

// makeStreamEnvelopeKit requires an enum of labels but typescript
// doesn't support enums as bounds on template parameters.
//
// See https://github.com/microsoft/TypeScript/issues/30611
//
// This workaround makes something equivalently type inferenceable.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const envelopeLabels = Object.values(EnvelopeLabel);

// For now, this envelope kit is for intial sends only

const envelopeKit = makeStreamEnvelopeKit<
  typeof envelopeLabels,
  {
    command: VatCommand;
    capTp: CapTpMessage;
  }
>({
  command: (value) => isVatCommand(value),
  capTp: isCapTpMessage,
});

export type StreamEnvelope = GuardType<typeof envelopeKit.isStreamEnvelope>;
export type StreamEnvelopeHandler = ReturnType<
  typeof envelopeKit.makeStreamEnvelopeHandler
>;

export const wrapStreamCommand = envelopeKit.streamEnveloper.command.wrap;
export const wrapCapTp = envelopeKit.streamEnveloper.capTp.wrap;
export const { makeStreamEnvelopeHandler } = envelopeKit;

// For now, a separate envelope kit for replies only

const streamEnvelopeReplyKit = makeStreamEnvelopeKit<
  typeof envelopeLabels,
  {
    command: VatCommandReply;
    capTp: CapTpMessage;
  }
>({
  command: (value) => isVatCommandReply(value),
  capTp: isCapTpMessage,
});

export type StreamEnvelopeReply = GuardType<
  typeof streamEnvelopeReplyKit.isStreamEnvelope
>;
export type StreamEnvelopeReplyHandler = ReturnType<
  typeof streamEnvelopeReplyKit.makeStreamEnvelopeHandler
>;

export const wrapStreamCommandReply =
  streamEnvelopeReplyKit.streamEnveloper.command.wrap;
// Note: We don't differentiate between wrapCapTp and wrapCapTpReply
export const { makeStreamEnvelopeHandler: makeStreamEnvelopeReplyHandler } =
  streamEnvelopeReplyKit;
