import { makeStreamEnvelopeKit } from '@ocap/streams';

import type { CapTpMessage, WrappedIframeMessage } from './message.js';
import { isCapTpMessage, isWrappedIframeMessage } from './message.js';

// Utilitous generic types.

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

const envelopeKit = makeStreamEnvelopeKit<
  typeof envelopeLabels,
  {
    command: WrappedIframeMessage;
    capTp: CapTpMessage;
  }
>({
  command: isWrappedIframeMessage,
  capTp: isCapTpMessage,
});

const { streamEnveloper, makeStreamEnvelopeHandler } = envelopeKit;

export type StreamEnvelope = GuardType<typeof envelopeKit.isStreamEnvelope>;
export type StreamEnvelopeHandler = ReturnType<
  typeof makeStreamEnvelopeHandler
>;

export const wrapCommand = streamEnveloper.command.wrap;
export const wrapCapTp = streamEnveloper.capTp.wrap;
export { makeStreamEnvelopeHandler };
