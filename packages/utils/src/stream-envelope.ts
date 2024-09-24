import { makeStreamEnvelopeKit } from '@ocap/streams';

import { isCapTpMessage, isVatMessage } from './type-guards.js';
import type { CapTpMessage, VatMessage } from './types.js';

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

const envelopeKit: ReturnType<
  typeof makeStreamEnvelopeKit<
    typeof envelopeLabels,
    {
      command: VatMessage;
      capTp: CapTpMessage;
    }
  >
> = makeStreamEnvelopeKit<
  typeof envelopeLabels,
  {
    command: VatMessage;
    capTp: CapTpMessage;
  }
>({
  command: isVatMessage,
  capTp: isCapTpMessage,
});

export type StreamEnvelope = GuardType<typeof envelopeKit.isStreamEnvelope>;
export type StreamEnvelopeHandler = ReturnType<
  typeof envelopeKit.makeStreamEnvelopeHandler
>;

export const wrapStreamCommand = envelopeKit.streamEnveloper.command.wrap;
export const wrapCapTp = envelopeKit.streamEnveloper.capTp.wrap;
export const { makeStreamEnvelopeHandler } = envelopeKit;
